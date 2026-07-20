import { db } from '../db'
import { settings } from '../schema/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { Logger } from '../../utils/Logger'
import { AuditService } from './AuditService'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'OPERATOR' | 'MANAGER'
}

export interface AuthSession {
  user: AuthUser | null
  isUnlocked: boolean
  hasPin: boolean
  inactivityTimeoutMinutes: number
}

export interface PinVerifyResult {
  success: boolean
  user?: AuthUser
  lockedOut?: boolean
  lockRemainingSeconds?: number
  attemptsLeft?: number
  error?: string
}

export class PinService {
  private static failedAttempts = 0
  private static lockoutUntil = 0
  private static sessionUnlocked = false
  private static currentUser: AuthUser | null = null

  static getCurrentUser(): AuthUser | null {
    return this.currentUser
  }

  /**
   * Hashes a PIN with a salt using PBKDF2 (100,000 iterations, SHA-512).
   * Compatible with Supabase custom RPC / Edge Function password verification.
   */
  private static hashPin(pin: string, salt: string): string {
    return crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex')
  }

  /**
   * Compares two hex hashes in constant time to prevent timing attacks.
   */
  private static timingSafeCompare(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'hex')
      const bufB = Buffer.from(b, 'hex')
      if (bufA.length !== bufB.length) return false
      return crypto.timingSafeEqual(bufA, bufB)
    } catch {
      return false
    }
  }

  /**
   * Checks if a security PIN has been configured.
   */
  static async hasPin(): Promise<boolean> {
    try {
      const records = await db.select().from(settings).where(eq(settings.key, 'pin_hash'))
      return records.length > 0 && Boolean(records[0].value)
    } catch (e) {
      Logger.error('Failed to check if PIN exists', e)
      return false
    }
  }

  /**
   * Retrieves current local AuthUser profile (designed for Supabase Auth migration).
   */
  static async getAuthUser(): Promise<AuthUser> {
    try {
      const records = await db.select().from(settings)
      const config: Record<string, string> = {}
      records.forEach((r) => {
        config[r.key] = r.value
      })

      return {
        id: config.auth_user_id || '00000000-0000-0000-0000-000000000001',
        email: config.auth_user_email || 'admin@sahara.com',
        name: config.auth_user_name || 'System Administrator',
        role: (config.auth_user_role as any) || 'ADMIN',
      }
    } catch {
      return {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@sahara.com',
        name: 'System Administrator',
        role: 'ADMIN',
      }
    }
  }

  /**
   * Gets current PIN salt and hash from settings.
   */
  private static async getPinRecord(): Promise<{ salt: string; hash: string } | null> {
    try {
      const saltRecord = await db.select().from(settings).where(eq(settings.key, 'pin_salt'))
      const hashRecord = await db.select().from(settings).where(eq(settings.key, 'pin_hash'))
      if (saltRecord.length > 0 && hashRecord.length > 0 && saltRecord[0].value && hashRecord[0].value) {
        return { salt: saltRecord[0].value, hash: hashRecord[0].value }
      }
      return null
    } catch (e) {
      Logger.error('Failed to fetch PIN records', e)
      return null
    }
  }

  /**
   * Creates the initial security PIN and user profile.
   */
  static async createPin(
    pin: string,
    profile?: { name?: string; email?: string; role?: 'ADMIN' | 'OPERATOR' },
    user: string = 'ADMIN'
  ): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    if (!/^\d{4,8}$/.test(pin)) {
      return { success: false, error: 'PIN must be between 4 and 8 numeric digits.' }
    }

    const exists = await this.hasPin()
    if (exists) {
      return { success: false, error: 'PIN already exists. Use Change PIN feature instead.' }
    }

    try {
      const salt = crypto.randomBytes(32).toString('hex')
      const hash = this.hashPin(pin, salt)
      const now = new Date().toISOString()
      const userId = crypto.randomUUID()

      const userProfile: AuthUser = {
        id: userId,
        email: profile?.email || 'admin@sahara.com',
        name: profile?.name || 'System Administrator',
        role: profile?.role || 'ADMIN',
      }

      const updates: Record<string, string> = {
        pin_salt: salt,
        pin_hash: hash,
        auth_user_id: userProfile.id,
        auth_user_email: userProfile.email,
        auth_user_name: userProfile.name,
        auth_user_role: userProfile.role,
      }

      for (const [key, value] of Object.entries(updates)) {
        const match = await db.select().from(settings).where(eq(settings.key, key))
        if (match.length > 0) {
          await db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, key))
        } else {
          await db.insert(settings).values({ id: crypto.randomUUID(), key, value, updatedAt: now })
        }
      }

      this.failedAttempts = 0
      this.lockoutUntil = 0
      this.sessionUnlocked = true
      this.currentUser = userProfile

      await AuditService.log('SECURITY', 'PIN', 'CREATE', null, { status: 'PIN_CREATED', user: userProfile }, user)
      Logger.info(`Initial Auth PIN created successfully for ${userProfile.name} (${userProfile.email})`)

      return { success: true, user: userProfile }
    } catch (e) {
      Logger.error('Failed to create initial PIN', e)
      return { success: false, error: 'Failed to create PIN in database.' }
    }
  }

  /**
   * Verifies input PIN against stored hash with lockout protection.
   */
  static async verifyPin(pin: string, actionName: string = 'UNLOCK', user: string = 'OPERATOR'): Promise<PinVerifyResult> {
    const now = Date.now()
    if (now < this.lockoutUntil) {
      const remainingSeconds = Math.ceil((this.lockoutUntil - now) / 1000)
      return {
        success: false,
        lockedOut: true,
        lockRemainingSeconds: remainingSeconds,
        error: `Security lockout active due to multiple failed attempts. Please wait ${remainingSeconds}s.`,
      }
    }

    const pinRecord = await this.getPinRecord()
    if (!pinRecord) {
      return { success: false, error: 'No security PIN has been created yet.' }
    }

    const inputHash = this.hashPin(pin, pinRecord.salt)
    const isValid = this.timingSafeCompare(inputHash, pinRecord.hash)
    const authUser = await this.getAuthUser()

    if (isValid) {
      this.failedAttempts = 0
      this.lockoutUntil = 0
      this.sessionUnlocked = true
      this.currentUser = authUser

      await AuditService.log('SECURITY', actionName, 'UPDATE', null, { status: 'PIN_VERIFIED', actionName, userId: authUser.id }, user)
      return { success: true, user: authUser }
    }

    // Invalid PIN handling
    this.failedAttempts += 1
    const attemptsLeft = Math.max(0, 5 - this.failedAttempts)

    if (this.failedAttempts >= 5) {
      this.lockoutUntil = Date.now() + 30000 // 30 second lockout
      await AuditService.log('SECURITY', actionName, 'DELETE', null, { status: 'LOCKOUT_TRIGGERED', attempts: 5 }, user)
      Logger.warn(`Security Lockout triggered for action "${actionName}" after 5 failed attempts by ${user}`)

      return {
        success: false,
        lockedOut: true,
        lockRemainingSeconds: 30,
        attemptsLeft: 0,
        error: 'Too many incorrect PIN attempts. System locked out for 30 seconds.',
      }
    }

    await AuditService.log('SECURITY', actionName, 'UPDATE', null, { status: 'PIN_FAILED', attemptsLeft }, user)
    Logger.warn(`Incorrect PIN attempt for action "${actionName}" by ${user} (${attemptsLeft} attempts remaining)`)

    return {
      success: false,
      lockedOut: false,
      attemptsLeft,
      error: `Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before lockout.`,
    }
  }

  /**
   * Changes existing PIN after verifying current PIN.
   */
  static async changePin(currentPin: string, newPin: string, user: string = 'ADMIN'): Promise<{ success: boolean; error?: string }> {
    const verifyRes = await this.verifyPin(currentPin, 'CHANGE_PIN_VERIFY', user)
    if (!verifyRes.success) {
      return { success: false, error: verifyRes.error || 'Current PIN verification failed.' }
    }

    if (!/^\d{4,8}$/.test(newPin)) {
      return { success: false, error: 'New PIN must be between 4 and 8 numeric digits.' }
    }

    try {
      const salt = crypto.randomBytes(32).toString('hex')
      const hash = this.hashPin(newPin, salt)
      const now = new Date().toISOString()

      for (const [key, value] of Object.entries({ pin_salt: salt, pin_hash: hash })) {
        await db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, key))
      }

      this.failedAttempts = 0
      this.lockoutUntil = 0

      await AuditService.log('SECURITY', 'PIN', 'UPDATE', null, { status: 'PIN_CHANGED' }, user)
      Logger.info(`Security PIN updated successfully by ${user}`)

      return { success: true }
    } catch (e) {
      Logger.error('Failed to change PIN', e)
      return { success: false, error: 'Database update failed while changing PIN.' }
    }
  }

  /**
   * Locks the current session.
   */
  static lockSession(): boolean {
    this.sessionUnlocked = false
    this.currentUser = null
    return true
  }

  /**
   * Unlocks the current session.
   */
  static unlockSession(): boolean {
    this.sessionUnlocked = true
    return true
  }

  /**
   * Returns whether current session is unlocked.
   */
  static isSessionUnlocked(): boolean {
    return this.sessionUnlocked
  }

  /**
   * Gets session security status & active AuthUser (designed for Supabase Auth migration).
   */
  static async getSessionStatus(): Promise<AuthSession> {
    const hasPin = await this.hasPin()
    let timeoutMinutes = 15 // Default 15 mins
    const user = hasPin ? await this.getAuthUser() : null

    try {
      const record = await db.select().from(settings).where(eq(settings.key, 'inactivity_timeout_minutes'))
      if (record.length > 0 && record[0].value) {
        timeoutMinutes = parseInt(record[0].value, 10) || 15
      }
    } catch { /* use default */ }

    return {
      user,
      hasPin,
      isUnlocked: this.sessionUnlocked,
      inactivityTimeoutMinutes: timeoutMinutes,
    }
  }

  /**
   * Updates configured inactivity timeout in minutes (0 = disabled).
   */
  static async setInactivityTimeout(minutes: number, user: string = 'ADMIN'): Promise<boolean> {
    try {
      const now = new Date().toISOString()
      const match = await db.select().from(settings).where(eq(settings.key, 'inactivity_timeout_minutes'))
      if (match.length > 0) {
        await db.update(settings).set({ value: String(minutes), updatedAt: now }).where(eq(settings.key, 'inactivity_timeout_minutes'))
      } else {
        await db.insert(settings).values({ id: crypto.randomUUID(), key: 'inactivity_timeout_minutes', value: String(minutes), updatedAt: now })
      }
      await AuditService.log('SECURITY', 'TIMEOUT', 'UPDATE', null, { timeoutMinutes: minutes }, user)
      return true
    } catch (e) {
      Logger.error('Failed to set inactivity timeout', e)
      return false
    }
  }
}
