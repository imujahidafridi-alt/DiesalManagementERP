import { describe, it, expect, beforeEach } from 'vitest'
import { PinService } from '../database/services/PinService'
import { db } from '../database/db'
import { settings } from '../database/schema/schema'

import { runMigrations } from '../database/migrator'

describe('PinService - Security & Supabase Migration Ready Auth', () => {
  beforeEach(async () => {
    runMigrations()
    // Clear settings table before each test
    await db.delete(settings)
  })

  it('should report false for hasPin when database is empty', async () => {
    const exists = await PinService.hasPin()
    expect(exists).toBe(false)
  })

  it('should create initial admin PIN and save AuthUser profile', async () => {
    const res = await PinService.createPin('123456', {
      name: 'Haroon Wazir',
      email: 'haroon@sahara.local',
      role: 'ADMIN',
    })

    expect(res.success).toBe(true)
    expect(res.user?.name).toBe('Haroon Wazir')
    expect(res.user?.role).toBe('ADMIN')

    const hasPin = await PinService.hasPin()
    expect(hasPin).toBe(true)
  })

  it('should reject invalid PIN lengths or formats', async () => {
    const res1 = await PinService.createPin('12')
    expect(res1.success).toBe(false)
    expect(res1.error).toContain('4 and 8 numeric digits')

    const res2 = await PinService.createPin('abcde')
    expect(res2.success).toBe(false)
  })

  it('should verify correct PIN and return user profile', async () => {
    await PinService.createPin('8888', { name: 'Manager' })

    const verifyRes = await PinService.verifyPin('8888', 'TEST_UNLOCK')
    expect(verifyRes.success).toBe(true)
    expect(verifyRes.user?.name).toBe('Manager')
  })

  it('should fail on incorrect PIN and track attempts left', async () => {
    await PinService.createPin('1111')

    const res = await PinService.verifyPin('9999', 'TEST_FAIL')
    expect(res.success).toBe(false)
    expect(res.attemptsLeft).toBe(4)
  })

  it('should trigger lockout after 5 consecutive failed attempts', async () => {
    await PinService.createPin('4321')

    for (let i = 0; i < 4; i++) {
      await PinService.verifyPin('0000', 'FAIL_TEST')
    }

    const fifthAttempt = await PinService.verifyPin('0000', 'FAIL_TEST')
    expect(fifthAttempt.success).toBe(false)
    expect(fifthAttempt.lockedOut).toBe(true)
    expect(fifthAttempt.lockRemainingSeconds).toBeGreaterThan(0)
  })

  it('should successfully change PIN when current PIN is valid', async () => {
    await PinService.createPin('5555')

    const changeRes = await PinService.changePin('5555', '7777')
    expect(changeRes.success).toBe(true)

    const verifyOld = await PinService.verifyPin('5555')
    expect(verifyOld.success).toBe(false)

    const verifyNew = await PinService.verifyPin('7777')
    expect(verifyNew.success).toBe(true)
  })
})
