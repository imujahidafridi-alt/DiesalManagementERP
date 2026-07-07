import { db } from '../db'
import { settings } from '../schema/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { Logger } from '../../utils/Logger'

export class SettingsService {
  static async getSettings(): Promise<Record<string, string>> {
    try {
      const records = await db.select().from(settings)
      const config: Record<string, string> = {}
      records.forEach((r) => {
        config[r.key] = r.value
      })

      // Add default configurations if not defined
      const defaults: Record<string, string> = {
        company_name: 'Sahara Diesels',
        company_address: 'Main Terminal Warehouse, Sector 12',
        company_phone: '+966-12-345-6789',
        company_email: 'info@sahara-diesels.com',
        currency: 'AED',
        currency_symbol: 'AED',
        quantity_unit: 'Gallon',
        quantity_abbreviation: 'Gal',
        quantity_precision: '2',
        price_precision: '2',
        negative_inventory_policy: 'BLOCK', // BLOCK or ALLOW
        default_backup_folder: '',
        max_backup_count: '10',
        startup_backup_enabled: 'false',
        shutdown_backup_enabled: 'false',
        row_density: 'compact', // compact or comfortable
        font_size: '12px',
        fuel_unit: 'Gal',
      }

      return {
        ...defaults,
        ...config,
      }
    } catch (e) {
      Logger.error('Failed to retrieve settings', e)
      return {}
    }
  }

  static async saveSettings(values: Record<string, string>, user: string) {
    Logger.info(`Saving application configuration updates. Action by: ${user}`)
    try {
      for (const [key, value] of Object.entries(values)) {
        // Check if key already exists
        const match = await db.select().from(settings).where(eq(settings.key, key))
        if (match.length > 0) {
          // Update
          await db
            .update(settings)
            .set({
              value: String(value),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(settings.key, key))
        } else {
          // Insert new row
          await db.insert(settings).values({
            id: crypto.randomUUID(),
            key,
            value: String(value),
            description: `Configuration key for ${key}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
      }
      return true
    } catch (e) {
      Logger.error('Failed to save settings', e)
      throw e
    }
  }
}
