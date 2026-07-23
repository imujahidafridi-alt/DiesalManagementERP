import { sqlite, dbPath, reopenDatabase } from '../db'
import Database from 'better-sqlite3'
import zlib from 'zlib'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { Logger } from '../../utils/Logger'
import { SettingsService } from './SettingsService'

export class BackupService {
  private static defaultBackupFolder: string | null = null

  static setBackupFolder(folder: string) {
    this.defaultBackupFolder = folder
  }

  static getBackupFolder(): string {
    if (this.defaultBackupFolder) {
      return this.defaultBackupFolder
    }
    
    // In Electron environment, default to User's Documents/Sahara Diesels Backups
    const isElectron = typeof process !== 'undefined' && process.versions && !!process.versions.electron
    if (isElectron) {
      try {
        const docPath = app.getPath('documents')
        const folder = path.join(docPath, 'Sahara_Diesels_Backups')
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder, { recursive: true })
        }
        return folder
      } catch (e) {
        // fallback
      }
    }
    
    // Fallback for tests or standard script runs
    const folder = path.join(process.cwd(), 'backups')
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true })
    }
    return folder
  }

  static async createBackup(manualReason?: string, maxCount?: number): Promise<string> {
    if (maxCount === undefined) {
      try {
        const settings = await SettingsService.getSettings()
        maxCount = parseInt(settings.max_backup_count || '30', 10) || 30
      } catch {
        maxCount = 30
      }
    }
    const backupFolder = this.getBackupFolder()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const tempFileName = `backup_temp_${timestamp}.db`
    const compressedFileName = `backup_${timestamp}${manualReason ? `_${manualReason}` : ''}.db.gz`
    
    const tempPath = path.join(backupFolder, tempFileName)
    const compressedPath = path.join(backupFolder, compressedFileName)

    Logger.info(`Starting database backup operation. Temp: ${tempPath}`)

    try {
      // 1. Run Online Backup to guarantee transactional consistency
      await sqlite.backup(tempPath)

      // 2. Compress the backup database using native Node zlib gzip stream
      await new Promise<void>((resolve, reject) => {
        const input = fs.createReadStream(tempPath)
        const output = fs.createWriteStream(compressedPath)
        const gzip = zlib.createGzip()

        input.on('error', reject)
        output.on('error', reject)
        gzip.on('error', reject)
        output.on('finish', resolve)

        input.pipe(gzip).pipe(output)
      })

      // 3. Delete temporary backup file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }

      Logger.info(`Database backup completed successfully. Compressed file: ${compressedPath}`)

      // 4. Perform backups rotation retention cleanup
      this.cleanupOldBackups(backupFolder, maxCount)

      return compressedPath
    } catch (error) {
      Logger.error('Failed to create database backup', error)
      // Cleanup temp if it exists
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath) } catch {}
      }
      throw error
    }
  }

  static listBackups() {
    const folder = this.getBackupFolder()
    if (!fs.existsSync(folder)) return []

    try {
      const files = fs.readdirSync(folder)
      return files
        .filter((file) => file.endsWith('.db.gz'))
        .map((file) => {
          const filePath = path.join(folder, file)
          const stat = fs.statSync(filePath)
          return {
            filename: file,
            path: filePath,
            sizeBytes: stat.size,
            createdAt: stat.mtime.toISOString(),
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } catch (e) {
      Logger.error('Failed to list backups', e)
      return []
    }
  }

  static deleteBackup(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        Logger.info(`Deleted backup file: ${filePath}`)
        return true
      }
      return false
    } catch (e) {
      Logger.error(`Failed to delete backup file: ${filePath}`, e)
      return false
    }
  }

  static cleanupOldBackups(_folder: string, maxCount: number) {
    try {
      const list = this.listBackups()
      if (list.length > maxCount) {
        const toDelete = list.slice(maxCount)
        toDelete.forEach((bk) => {
          if (fs.existsSync(bk.path)) {
            fs.unlinkSync(bk.path)
            Logger.info(`Rotated and deleted old backup: ${bk.filename}`)
          }
        })
      }
    } catch (e) {
      Logger.error('Failed rotating old backups', e)
    }
  }

  static async restoreBackup(compressedPath: string): Promise<boolean> {
    if (!fs.existsSync(compressedPath)) {
      throw new Error(`Backup file not found at: ${compressedPath}`)
    }

    const backupFolder = this.getBackupFolder()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const decompressedPath = path.join(backupFolder, `restore_temp_${timestamp}.db`)

    Logger.warn(`Initiating database restore from: ${compressedPath}`)

    try {
      // 1. Decompress gzipped backup file
      await new Promise<void>((resolve, reject) => {
        const input = fs.createReadStream(compressedPath)
        const output = fs.createWriteStream(decompressedPath)
        const gunzip = zlib.createGunzip()

        input.on('error', reject)
        output.on('error', reject)
        gunzip.on('error', reject)
        output.on('finish', resolve)

        input.pipe(gunzip).pipe(output)
      })

      // 2. Open temporary connection to validate integrity before swapping
      Logger.info('Validating integrity of decompressed database file')
      const checkDb = new Database(decompressedPath)
      try {
        const integrity = (checkDb.pragma('integrity_check') as any[])[0]
        if (integrity && integrity.integrity_check !== 'ok' && integrity !== 'ok') {
          throw new Error(`Database integrity check failed: ${JSON.stringify(integrity)}`)
        }
        const fkCheck = checkDb.pragma('foreign_key_check') as any[]
        if (fkCheck.length > 0) {
          throw new Error(`Foreign key constraint check failed: ${JSON.stringify(fkCheck)}`)
        }
      } finally {
        checkDb.close()
      }

      // 3. Swap the active database file safely
      Logger.warn('Swapping active database file with validated restore point')
      sqlite.close() // Close active db connection

      // Copy decompressed backup file over current db path
      fs.copyFileSync(decompressedPath, dbPath)
      
      // Delete temporary decompressed file
      if (fs.existsSync(decompressedPath)) {
        fs.unlinkSync(decompressedPath)
      }

      Logger.info('Database restore swap succeeded. Reloading connection.')
      // Re-open better-sqlite3 connection cleanly
      reopenDatabase()
      return true
    } catch (error) {
      Logger.error('Failed to restore database backup', error)
      if (fs.existsSync(decompressedPath)) {
        try { fs.unlinkSync(decompressedPath) } catch {}
      }
      throw error
    }
  }

  static checkIntegrity(): { ok: boolean; issues: string[] } {
    try {
      const issues: string[] = []
      
      const integrity = sqlite.pragma('integrity_check')
      if (integrity[0]?.integrity_check !== 'ok' && integrity[0] !== 'ok') {
        issues.push(`Integrity check failed: ${JSON.stringify(integrity)}`)
      }

      const fkCheck = sqlite.pragma('foreign_key_check')
      if (fkCheck.length > 0) {
        issues.push(`Foreign key check failed: ${JSON.stringify(fkCheck)}`)
      }

      // Check orphan records (e.g. transactions pointing to deleted or missing customer/driver)
      const orphanDrivers = sqlite.prepare(`
        SELECT DISTINCT t.source_id 
        FROM transactions t
        WHERE t.source_type = 'DRIVER' 
          AND t.source_id NOT IN (SELECT id FROM drivers)
      `).all()
      if (orphanDrivers.length > 0) {
        issues.push(`Orphan transactions source drivers: ${orphanDrivers.map((d: any) => d.source_id).join(', ')}`)
      }

      const orphanCustomers = sqlite.prepare(`
        SELECT DISTINCT t.destination_id 
        FROM transactions t
        WHERE t.destination_type = 'CUSTOMER' 
          AND t.destination_id NOT IN (SELECT id FROM customers)
      `).all()
      if (orphanCustomers.length > 0) {
        issues.push(`Orphan transactions destination customers: ${orphanCustomers.map((c: any) => c.destination_id).join(', ')}`)
      }

      return {
        ok: issues.length === 0,
        issues,
      }
    } catch (e: any) {
      Logger.error('Integrity check query failed', e)
      return { ok: false, issues: [e.message] }
    }
  }

  static optimizeDb() {
    Logger.info('Executing database optimization: VACUUM and ANALYZE')
    try {
      sqlite.exec('VACUUM')
      sqlite.exec('ANALYZE')
      Logger.info('Database vacuum and indices analyzed successfully')
      return true
    } catch (e) {
      Logger.error('Database optimization failed', e)
      throw e
    }
  }
}
