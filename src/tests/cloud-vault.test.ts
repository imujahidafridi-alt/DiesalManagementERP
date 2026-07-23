import { describe, it, expect, beforeEach } from 'vitest'
import { CloudVaultService } from '../database/services/CloudVaultService'
import { db } from '../database/db'
import { settings } from '../database/schema/schema'
import { runMigrations } from '../database/migrator'

describe('CloudVaultService - Automated Cloud Vault Backup Streaming', () => {
  beforeEach(async () => {
    runMigrations()
    await db.delete(settings)
  })

  it('should default to disabled cloud vault status when no settings exist', async () => {
    const config = await CloudVaultService.getSettings()
    expect(config.enabled).toBe(false)
    expect(config.provider).toBe('cloudflare_r2')

    const st = CloudVaultService.getStatus()
    expect(st.enabled).toBe(false)
    expect(st.status).toBe('DISABLED')
  })

  it('should save Cloud Vault credentials and enable status', async () => {
    const ok = await CloudVaultService.saveSettings(
      {
        enabled: true,
        provider: 'cloudflare_r2',
        endpoint: 'https://testaccountid.r2.cloudflarestorage.com',
        bucketName: 'sahara-diesels-vault-test',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        region: 'auto',
      },
      'TestAdmin'
    )

    expect(ok).toBe(true)

    const config = await CloudVaultService.getSettings()
    expect(config.enabled).toBe(true)
    expect(config.endpoint).toBe('https://testaccountid.r2.cloudflarestorage.com')
    expect(config.bucketName).toBe('sahara-diesels-vault-test')

    const st = CloudVaultService.getStatus()
    expect(st.enabled).toBe(true)
    expect(st.status).toBe('IDLE')
  })

  it('should return non-blocking failure when cloud vault sync is run with dummy endpoint', async () => {
    await CloudVaultService.saveSettings(
      {
        enabled: true,
        provider: 'cloudflare_r2',
        endpoint: 'https://invalid-account-id.r2.cloudflarestorage.com',
        bucketName: 'non-existent-bucket',
        accessKeyId: 'invalid-access-key',
        secretAccessKey: 'invalid-secret-key',
        region: 'auto',
      },
      'TestAdmin'
    )

    const result = await CloudVaultService.syncSnapshot('unit_test')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()

    const st = CloudVaultService.getStatus()
    expect(st.status).toBe('ERROR')
    expect(st.lastError).toBeDefined()
  })
})
