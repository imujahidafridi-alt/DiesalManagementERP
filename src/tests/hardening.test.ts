import { describe, it, expect, beforeAll } from 'vitest'
import { runMigrations } from '../database/migrator'
import { BackupService } from '../database/services/BackupService'
import { ImportService } from '../database/services/ImportService'
import { SettingsService } from '../database/services/SettingsService'
import { AuditService } from '../database/services/AuditService'
import { DriverService } from '../database/services/DriverService'
import { SupplierService } from '../database/services/SupplierService'
import { CustomerService } from '../database/services/CustomerService'
import { TransactionService } from '../database/services/TransactionService'
import { InventoryService } from '../database/services/InventoryService'
import { db } from '../database/db'
import { transactions } from '../database/schema/schema'
import fs from 'fs'
import crypto from 'crypto'

describe('Production Hardening, Backups, Audits & Data Imports E2E Tests', () => {
  const operator = 'Audit Admin'

  beforeAll(async () => {
    // Fresh DB migrations
    runMigrations()
  })

  // ----------------------------------------------------
  // 1. SETTINGS & LOCALIZATION TESTS
  // ----------------------------------------------------
  describe('Application Settings Configurations', () => {
    it('should upsert and read global settings key-values', async () => {
      const initial = await SettingsService.getSettings()
      expect(initial.company_name).toBe('Sahara Diesels')

      const updates = {
        company_name: 'Sahara Fuel Log',
        currency_symbol: 'SAR',
        quantity_precision: '3',
      }
      await SettingsService.saveSettings(updates, operator)

      const active = await SettingsService.getSettings()
      expect(active.company_name).toBe('Sahara Fuel Log')
      expect(active.currency_symbol).toBe('SAR')
      expect(active.quantity_precision).toBe('3')
    })
  })

  // ----------------------------------------------------
  // 2. BACKUP & RESTORE GZIP STREAMS
  // ----------------------------------------------------
  describe('Backup & Restore Operations', () => {
    it('should generate compressed gzip backups and rotate correctly', async () => {
      // 1. Generate Backup
      const maxCount = 2
      const backupPath = await BackupService.createBackup('TestRotation', maxCount)
      expect(fs.existsSync(backupPath)).toBe(true)
      expect(backupPath.endsWith('.db.gz')).toBe(true)

      // Generate a few more to trigger rotation retention
      const backup2 = await BackupService.createBackup('TestRotation2', maxCount)
      const backup3 = await BackupService.createBackup('TestRotation3', maxCount)

      expect(fs.existsSync(backup2)).toBe(true)
      expect(fs.existsSync(backup3)).toBe(true)

      // List backups - should contain max of 2 due to rotation
      const list = BackupService.listBackups()
      expect(list.length).toBeLessThanOrEqual(maxCount)
      
      // Cleanup files
      list.forEach(bk => {
        if (fs.existsSync(bk.path)) fs.unlinkSync(bk.path)
      })
    })

    it('should verify database integrity checks', async () => {
      const diag = BackupService.checkIntegrity()
      expect(diag.ok).toBe(true)
      expect(diag.issues.length).toBe(0)
    })
  })

  // ----------------------------------------------------
  // 3. EXCEL / CSV DATA MIGRATION IMPORT WIZARD
  // ----------------------------------------------------
  describe('Excel Import Wizard & Transactions Rollback', () => {
    it('should reject invalid import files and roll back changes', async () => {
      // Mock rows with invalid references and negative volumes
      const invalidRows = [
        { name: 'Driver A', phone: '+999' },
        { name: '', phone: '+888' }, // Validation failure: empty name
      ]

      const result = await ImportService.importRecords('DRIVER', invalidRows, operator)
      expect(result.imported).toBe(0)
      expect(result.failed).toBe(2)
      expect(result.errors.length).toBeGreaterThan(0)

      // Verify no driver was inserted (E2E transaction rollback!)
      const list = await DriverService.list()
      const match = list.find(d => d.phone === '+999')
      expect(match).toBeUndefined()
    })

    it('should successfully import valid entities', async () => {
      const validDrivers = [
        { name: 'Migration Driver X', phone: '+111222' },
        { name: 'Migration Driver Y', phone: '+333444' },
      ]

      const result = await ImportService.importRecords('DRIVER', validDrivers, operator)
      expect(result.imported).toBe(2)
      expect(result.errors.length).toBe(0)

      const list = await DriverService.list()
      const dX = list.find(d => d.name === 'Migration Driver X')
      const dY = list.find(d => d.name === 'Migration Driver Y')
      
      expect(dX).toBeDefined()
      expect(dY).toBeDefined()
      expect(dX?.phone).toBe('+111222')
    })
  })

  // ----------------------------------------------------
  // 4. SECURITY AUDIT TRAIL LOGGING
  // ----------------------------------------------------
  describe('Security Auditing', () => {
    it('should capture CRUD triggers and previous/new diff state payloads', async () => {
      const id = crypto.randomUUID()
      // Seed a supplier to trigger Audit Log
      await SupplierService.createSupplier({
        id,
        companyName: 'Audit Ref Supplier',
        contactPerson: 'Manager',
        phone: '123',
        address: 'Harbor',
      }, operator)

      const logs = await AuditService.list('suppliers', id)
      expect(logs.length).toBeGreaterThan(0)
      
      const creationLog = logs.find(l => l.action === 'CREATE')
      expect(creationLog).toBeDefined()
      expect(creationLog?.user).toBe(operator)
      expect(creationLog?.newData).toContain('Audit Ref Supplier')
    })
  })

  // ----------------------------------------------------
  // 5. E2E BUSINESS LEDGER FLOW
  // ----------------------------------------------------
  describe('E2E Ledger Flow Consistency', () => {
    it('should complete bulk operations cycle and match downstream valuation/margins', async () => {
      // 1. Seed directories
      const sup = await SupplierService.createSupplier({
        id: crypto.randomUUID(),
        companyName: 'Ledge Ref Co',
      }, operator)

      const drv = await DriverService.createDriver({
        id: crypto.randomUUID(),
        name: 'Ledge Driver',
      }, operator)

      const cust = await CustomerService.createCustomer({
        id: crypto.randomUUID(),
        companyName: 'Ledge Customer Co',
      }, operator)

      // 2. E2E Transactions Cycle
      // Purchase: 2000L @ $1.00 (100 cents) -> Driver directly
      await TransactionService.createPurchase({
        supplierId: sup.id,
        destinationLocation: drv.id,
        quantity: 2000,
        unitCost: 100,
        transactionDate: '2026-07-03',
        referenceNumber: 'LDG-100',
      }, operator)

      // Sale Invoice: 1000L sold to Customer @ $1.50 (150 cents)
      // Margin: 1000 * (150 - 100) = 50,000 cents ($500.00)
      await TransactionService.createSale({
        driverId: drv.id,
        customerId: cust.id,
        quantity: 1000,
        sellingRate: 150,
        transactionDate: '2026-07-05',
      }, operator)

      // 3. Confirm Inventory Valuation & Downstream math
      const driverSnapshot = await InventoryService.getSnapshot(drv.id)

      // Driver stock: 2000 - 1000 = 1000L
      expect(driverSnapshot.currentStock).toBe(1000)
      expect(driverSnapshot.weightedAverageCost).toBe(100)

      // Total ledger transactions
      const txsList = await db.select().from(transactions)
      const sales = txsList.filter(t => t.transactionType === 'SALE' && t.destinationId === cust.id)
      expect(sales.length).toBe(1)
      expect(sales[0].profitSnapshot).toBe(50000)
    })
  })
})
