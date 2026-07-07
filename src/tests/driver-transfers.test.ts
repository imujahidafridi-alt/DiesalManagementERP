import { describe, it, expect, beforeAll } from 'vitest'
import { runMigrations } from '../database/migrator'
import { DriverService } from '../database/services/DriverService'
import { SupplierService } from '../database/services/SupplierService'
import { TransactionService } from '../database/services/TransactionService'
import { InventoryService } from '../database/services/InventoryService'
import { InsufficientInventoryError } from '../database/errors'
import crypto from 'crypto'

describe('Driver Ledger & Internal Diesel Transfer Integration Tests', () => {
  let supplierId: string
  let driverAId: string
  let driverBId: string
  const operator = 'Audit Admin'

  beforeAll(async () => {
    // Run migrations on test memory DB
    runMigrations()

    // 1. Seed Supplier
    const s = await SupplierService.createSupplier(
      {
        id: crypto.randomUUID(),
        companyName: 'Wholesale Depot Inc.',
        contactPerson: 'Manager',
        phone: '+11111',
        address: 'Harbor Refinery',
      },
      operator
    )
    supplierId = s.id

    // 2. Seed Driver A & Driver B
    const da = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Driver Alpha',
        phone: '+12345',
      },
      operator
    )
    driverAId = da.id

    const db = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Driver Beta',
        phone: '+67890',
      },
      operator
    )
    driverBId = db.id
  })

  // ----------------------------------------------------
  // A. DRIVER DIRECTORY OPERATION TESTS
  // ----------------------------------------------------
  describe('Driver Registry Profiles', () => {
    it('should successfully create, update, and fetch drivers', async () => {
      const newDriver = await DriverService.createDriver(
        {
          id: crypto.randomUUID(),
          name: 'Driver Gamma',
          phone: '+112233',
          notes: 'Contract Operator',
        },
        operator
      )

      expect(newDriver.name).toBe('Driver Gamma')

      const updated = await DriverService.updateDriver(
        newDriver.id,
        {
          phone: '+998877',
          notes: 'Updated note field',
        },
        operator
      )
      expect(updated.phone).toBe('+998877')
      expect(updated.notes).toBe('Updated note field')
    })
  })

  // ----------------------------------------------------
  // B. INTERNAL TRANSFER CHECKS & HISTORICAL BALANCES
  // ----------------------------------------------------
  describe('Internal Transfers & Dynamic Balance Engine', () => {
    it('should transfer fuel, verify balances, query historical balances, and update/delete correctly', async () => {
      // 1. Initial State: Driver A has 0 balance, Driver B has 0 balance
      let balA = await DriverService.calculateDriverBalance(driverAId)
      let balB = await DriverService.calculateDriverBalance(driverBId)
      expect(balA).toBe(0)
      expect(balB).toBe(0)

      // 2. Buy Diesel into Driver A's assigned vehicle (ABC-123)
      // 2000L @ $1.20 (120 cents) on 2026-07-01
      await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: driverAId,
          quantity: 2000,
          unitCost: 120,
          transactionDate: '2026-07-01',
          referenceNumber: 'PLATE-A',
        },
        operator
      )

      balA = await DriverService.calculateDriverBalance(driverAId)
      expect(balA).toBe(2000)

      // 3. Create Transfer: Driver A transfers 800L to Driver B on 2026-07-05
      const transfer = await TransactionService.createTransfer(
        {
          fromDriverId: driverAId,
          toDriverId: driverBId,
          quantity: 800,
          transactionDate: '2026-07-05',
        },
        operator
      )

      expect(transfer.quantity).toBe(800)

      // Verify current stock levels
      balA = await DriverService.calculateDriverBalance(driverAId)
      balB = await DriverService.calculateDriverBalance(driverBId)
      expect(balA).toBe(1200) // 2000 - 800
      expect(balB).toBe(800)

      // 4. Verify carrying WAC remains unchanged for Driver B
      const wacB = await InventoryService.calculateWeightedAverageCost(driverBId)
      expect(wacB).toBe(120) // carries original purchase WAC

      // 5. Test Historical Balance Querying
      // Balance on 2026-07-02 (after purchase but before transfer)
      const histA_July2 = await DriverService.calculateDriverBalance(driverAId, '2026-07-02')
      const histB_July2 = await DriverService.calculateDriverBalance(driverBId, '2026-07-02')
      expect(histA_July2).toBe(2000)
      expect(histB_July2).toBe(0)

      // Balance on 2026-07-06 (after transfer)
      const histA_July6 = await DriverService.calculateDriverBalance(driverAId, '2026-07-06')
      const histB_July6 = await DriverService.calculateDriverBalance(driverBId, '2026-07-06')
      expect(histA_July6).toBe(1200)
      expect(histB_July6).toBe(800)

      // 6. Test Transfer Editing (change quantity from 800 to 500)
      const updatedTransfer = await TransactionService.updateTransfer(
        transfer.id,
        {
          fromDriverId: driverAId,
          toDriverId: driverBId,
          quantity: 500, // Reduced transfer quantity
          transactionDate: '2026-07-05',
        },
        operator
      )
      expect(updatedTransfer.quantity).toBe(500)

      // Verify recalculated balances
      balA = await DriverService.calculateDriverBalance(driverAId)
      balB = await DriverService.calculateDriverBalance(driverBId)
      expect(balA).toBe(1500) // 2000 - 500
      expect(balB).toBe(500)

      // 7. Validate Same Driver transfer restriction
      await expect(
        TransactionService.createTransfer(
          {
            fromDriverId: driverAId,
            toDriverId: driverAId,
            quantity: 100,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow()

      // 8. Validate Insufficient Balance validation on transfer
      await expect(
        TransactionService.createTransfer(
          {
            fromDriverId: driverAId,
            toDriverId: driverBId,
            quantity: 99999, // exceeds available stock
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(InsufficientInventoryError)

      // 9. Soft-Delete Transfer
      await TransactionService.deleteTransaction(transfer.id, operator)

      // Verify stock levels restored to pre-transfer levels
      balA = await DriverService.calculateDriverBalance(driverAId)
      balB = await DriverService.calculateDriverBalance(driverBId)
      expect(balA).toBe(2000)
      expect(balB).toBe(0)
    })
  })
})
