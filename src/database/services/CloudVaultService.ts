import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { BackupService } from './BackupService'
import { SettingsService } from './SettingsService'
import { Logger } from '../../utils/Logger'

export interface CloudVaultConfig {
  enabled: boolean
  provider: 'cloudflare_r2' | 'aws_s3' | 'custom_s3'
  endpoint: string // E.g., https://<account_id>.r2.cloudflarestorage.com
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  region?: string
}

export interface CloudVaultStatus {
  enabled: boolean
  status: 'DISABLED' | 'IDLE' | 'SYNCING' | 'SUCCESS' | 'OFFLINE' | 'FAILED' | 'ERROR'
  lastSyncTime: string | null
  lastError: string | null
  syncedSnapshotsCount: number
}

export interface CloudSnapshotItem {
  key: string
  sizeBytes: number
  lastModified: string
  sha256?: string
}

export class CloudVaultService {
  private static status: CloudVaultStatus = {
    enabled: false,
    status: 'DISABLED',
    lastSyncTime: null,
    lastError: null,
    syncedSnapshotsCount: 0,
  }

  private static isSyncing = false

  /**
   * Retrieves current Cloud Vault settings from process.env or settings table fallback.
   */
  static async getSettings(): Promise<CloudVaultConfig> {
    const raw = await SettingsService.getSettings()

    const envEnabled = process.env.CLOUD_VAULT_ENABLED
    const envProvider = process.env.CLOUD_VAULT_PROVIDER
    const envEndpoint = process.env.CLOUD_VAULT_ENDPOINT
    const envBucket = process.env.CLOUD_VAULT_BUCKET_NAME
    const envAccessKey = process.env.CLOUD_VAULT_ACCESS_KEY_ID
    const envSecretKey = process.env.CLOUD_VAULT_SECRET_ACCESS_KEY
    const envRegion = process.env.CLOUD_VAULT_REGION

    return {
      enabled: envEnabled !== undefined ? envEnabled === 'true' : raw['cloud_vault_enabled'] === 'true',
      provider: ((envProvider || raw['cloud_vault_provider'] || 'cloudflare_r2') as any),
      endpoint: (envEndpoint || raw['cloud_vault_endpoint'] || '').trim(),
      bucketName: (envBucket || raw['cloud_vault_bucket_name'] || '').trim(),
      accessKeyId: (envAccessKey || raw['cloud_vault_access_key_id'] || '').trim(),
      secretAccessKey: (envSecretKey || raw['cloud_vault_secret_access_key'] || '').trim(),
      region: (envRegion || raw['cloud_vault_region'] || 'auto').trim(),
    }
  }

  /**
   * Saves Cloud Vault configuration.
   */
  static async saveSettings(config: CloudVaultConfig, user: string): Promise<boolean> {
    await SettingsService.saveSettings(
      {
        cloud_vault_enabled: config.enabled ? 'true' : 'false',
        cloud_vault_provider: config.provider,
        cloud_vault_endpoint: config.endpoint.trim(),
        cloud_vault_bucket_name: config.bucketName.trim(),
        cloud_vault_access_key_id: config.accessKeyId.trim(),
        cloud_vault_secret_access_key: config.secretAccessKey.trim(),
        cloud_vault_region: config.region || 'auto',
      },
      user
    )

    this.status.enabled = config.enabled
    if (!config.enabled) {
      this.status.status = 'DISABLED'
    } else {
      this.status.status = 'IDLE'
    }
    return true
  }

  /**
   * Instantiates AWS S3 Client with Cloudflare R2 / S3 custom parameters.
   */
  private static getS3Client(config: CloudVaultConfig): S3Client {
    if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error('Cloud storage configuration incomplete')
    }

    return new S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  /**
   * Test Connection with cloud storage credentials.
   */
  static async testConnection(config: CloudVaultConfig): Promise<{ success: boolean; message: string }> {
    try {
      const client = this.getS3Client(config)
      const command = new ListObjectsV2Command({
        Bucket: config.bucketName,
        MaxKeys: 1,
      })
      await client.send(command)
      return { success: true, message: 'Cloud storage connection active & verified!' }
    } catch (err: any) {
      Logger.error(`Cloud Vault connection test failed: ${err.message}`)
      return { success: false, message: 'Could not connect to cloud storage. Please check network connection.' }
    }
  }

  /**
   * Get current sync status summary.
   */
  static getStatus(): CloudVaultStatus {
    return { ...this.status }
  }

  /**
   * Calculates SHA-256 hash checksum of a local file.
   */
  private static calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  /**
   * Performs an automated background Cloud Vault Sync (S3 / R2 upload).
   * Non-blocking: Errors are logged to system logger and UI status without breaking caller transactions.
   */
  static async syncSnapshot(manualReason?: string): Promise<{ success: boolean; key?: string; error?: string }> {
    const config = await this.getSettings()
    if (!config.enabled) {
      this.status.status = 'DISABLED'
      return { success: false, error: 'Cloud Vault disabled' }
    }

    if (this.isSyncing) {
      return { success: false, error: 'Sync operation already in progress' }
    }

    this.isSyncing = true
    this.status.status = 'SYNCING'
    this.status.lastError = null

    try {
      // 1. Generate local compressed snapshot using existing BackupService
      const reasonTag = manualReason ? `cloud_${manualReason}` : 'cloud_auto'
      const localBackupPath = await BackupService.createBackup(reasonTag)
      const fileName = path.basename(localBackupPath)

      // 2. Compute SHA-256 hash checksum for cryptographic validation
      const sha256Hash = await this.calculateSha256(localBackupPath)
      const fileBuffer = fs.readFileSync(localBackupPath)

      // 3. Upload to Cloudflare R2 / S3
      const client = this.getS3Client(config)
      const objectKey = `vault_backups/${fileName}`

      const uploadCommand = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
        Body: fileBuffer,
        ContentType: 'application/gzip',
        Metadata: {
          sha256: sha256Hash,
          timestamp: new Date().toISOString(),
          reason: reasonTag,
        },
      })

      await client.send(uploadCommand)

      this.status.status = 'SUCCESS'
      this.status.lastSyncTime = new Date().toISOString()
      this.status.syncedSnapshotsCount += 1
      Logger.info(`Cloud Vault Sync completed successfully. Key: ${objectKey}, SHA256: ${sha256Hash}`)

      return { success: true, key: objectKey }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown Cloud Vault sync error'
      this.status.status = 'FAILED'
      this.status.lastError = errMsg
      Logger.error(`Cloud Vault Sync failed: ${errMsg}`)
      return { success: false, error: errMsg }
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Lists available cloud snapshots in R2/S3 for disaster recovery.
   */
  static async listSnapshots(): Promise<CloudSnapshotItem[]> {
    const config = await this.getSettings()
    if (!config.enabled) return []

    try {
      const client = this.getS3Client(config)
      const command = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: 'vault_backups/',
      })

      const res = await client.send(command)
      if (!res.Contents) return []

      return res.Contents.map((obj) => ({
        key: obj.Key || '',
        sizeBytes: obj.Size || 0,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString(),
      })).sort((a, b) => b.lastModified.localeCompare(a.lastModified))
    } catch (err: any) {
      Logger.error(`Failed to list Cloud Vault snapshots: ${err.message}`)
      return []
    }
  }

  /**
   * Restores database from a Cloud Vault snapshot key.
   */
  static async restoreFromSnapshot(objectKey: string): Promise<boolean> {
    const config = await this.getSettings()
    if (!config.enabled) throw new Error('Cloud Vault is disabled')

    Logger.info(`Starting Cloud Vault restore operation for key: ${objectKey}`)

    const client = this.getS3Client(config)
    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
    })

    const res = await client.send(command)
    if (!res.Body) throw new Error('Received empty object body from Cloud Vault')

    const byteArray = await res.Body.transformToByteArray()
    const tempDownloadFolder = BackupService.getBackupFolder()
    const targetPath = path.join(tempDownloadFolder, `cloud_download_${Date.now()}.db.gz`)

    fs.writeFileSync(targetPath, Buffer.from(byteArray))

    // Restore local database using BackupService
    const restored = await BackupService.restoreBackup(targetPath)
    Logger.info(`Cloud Vault snapshot restored successfully from ${targetPath}`)
    return restored
  }
}
