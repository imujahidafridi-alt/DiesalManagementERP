import { describe, it, expect, beforeAll } from 'vitest'
import { runMigrations } from '../database/migrator'
import { DriverService } from '../database/services/DriverService'
import { SupplierService } from '../database/services/SupplierService'
import { CustomerService } from '../database/services/CustomerService'
import { TransactionService } from '../database/services/TransactionService'
import { InventoryService } from '../database/services/InventoryService'
import { ValidationError, SupplierNotFoundError } from '../database/errors'
import crypto from 'crypto'

describe('Purchase Module & Retroactive WAC Propagation Integration Tests', () => {
  let supplierId: string
  let customerId: string
  let driverId: string
  const operator = 'Audit Admin'

  beforeAll(async () => {
    runMigrations()

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

    const c = await CustomerService.createCustomer(
      {
        id: crypto.randomUUID(),
        companyName: 'Transit Client Corp',
        contactPerson: 'Logistics Head',
        phone: '+22222',
        address: 'Downtown Hub',
      },
      operator
    )
    customerId = c.id

    const d = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Transporter Alpha',
        phone: '+99999',
      },
      operator
    )
    driverId = d.id
  })

  // ----------------------------------------------------
  // A. PURCHASE VALIDATION CHECKS
  // ----------------------------------------------------
  describe('Purchase Input Validations', () => {
    it('should throw ValidationError on zero or negative quantity', async () => {
      await expect(
        TransactionService.createPurchase(
          {
            supplierId,
            destinationLocation: driverId,
            quantity: 0,
            unitCost: 120,
            transactionDate: '2026-07-05',
            referenceNumber: 'VEH-PUR-01',
          },
          operator
        )
      ).rejects.toThrow(ValidationError)

      await expect(
        TransactionService.createPurchase(
          {
            supplierId,
            destinationLocation: driverId,
            quantity: -100,
            unitCost: 120,
            transactionDate: '2026-07-05',
            referenceNumber: 'VEH-PUR-01',
          },
          operator
        )
      ).rejects.toThrow(ValidationError)
    })

    it('should throw ValidationError on zero or negative rate cost', async () => {
      await expect(
        TransactionService.createPurchase(
          {
            supplierId,
            destinationLocation: driverId,
            quantity: 1000,
            unitCost: 0,
            transactionDate: '2026-07-05',
            referenceNumber: 'VEH-PUR-01',
          },
          operator
        )
      ).rejects.toThrow(ValidationError)
    })

    it('should throw SupplierNotFoundError when supplier does not exist', async () => {
      const fakeUuid = crypto.randomUUID()
      await expect(
        TransactionService.createPurchase(
          {
            supplierId: fakeUuid,
            destinationLocation: driverId,
            quantity: 1000,
            unitCost: 120,
            transactionDate: '2026-07-05',
            referenceNumber: 'VEH-PUR-01',
          },
          operator
        )
      ).rejects.toThrow(SupplierNotFoundError)
    })
  })

  // ----------------------------------------------------
  // B. CHRONOLOGICAL WAC RETROACTIVE PROPAGATION
  // ----------------------------------------------------
  describe('Retroactive WAC Recalculation Loops', () => {
    it('should propagate cost rate updates across downstream transfers and sales', async () => {
      // Create Driver B
      const db = await DriverService.createDriver(
        {
          id: crypto.randomUUID(),
          name: 'Transporter Beta',
          phone: '+88888',
        },
        operator
      )
      const driverBId = db.id

      // 1. Initial purchase: 1000L @ $1.20 (120 cents) to Driver A
      const p1 = await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: driverId,
          quantity: 1000,
          unitCost: 120,
          transactionDate: '2026-07-05',
          referenceNumber: 'VEH-PUR-01',
        },
        operator
      )

      expect(p1.averageCostSnapshot).toBe(120)
      let currentWac = await InventoryService.calculateWeightedAverageCost(driverId)
      let currentStock = await InventoryService.calculateInventory(driverId)
      expect(currentStock).toBe(1000)
      expect(currentWac).toBe(120)

      // 2. Transfer: Move 500L from Driver A to Driver B (should carry 120 cents WAC)
      const t1 = await TransactionService.createTransfer(
        {
          fromDriverId: driverId,
          toDriverId: driverBId,
          quantity: 500,
          transactionDate: '2026-07-05',
          referenceNumber: 'GP-001',
        },
        operator
      )
      expect(t1.unitCost).toBe(120)
      expect(t1.averageCostSnapshot).toBe(120)

      // 3. Sale: Sell 200L from Driver B to Customer at $2.00 (200 cents).
      // Profit should be 200 * (200 - 120) = 16000 cents ($160.00)
      const s1 = await TransactionService.createSale(
        {
          driverId: driverBId,
          customerId,
          quantity: 200,
          sellingRate: 200,
          transactionDate: '2026-07-05',
          referenceNumber: 'SAL-001',
        },
        operator
      )
      expect(s1.averageCostSnapshot).toBe(120)
      expect(s1.profitSnapshot).toBe(16000)

      // 4. NOW RETROACTIVELY UPDATE Purchase 1: Change unitCost from 120 to 100 cents ($1.00)
      const updatedP1 = await TransactionService.updatePurchase(
        p1.id,
        {
          supplierId,
          destinationLocation: driverId,
          quantity: 1000,
          unitCost: 100, // Reduced cost
          transactionDate: '2026-07-05',
          referenceNumber: 'VEH-PUR-01-REV',
        },
        operator
      )

      expect(updatedP1.unitCost).toBe(100)
      expect(updatedP1.averageCostSnapshot).toBe(100)

      // 5. Verify Driver A WAC has updated to 100
      const wacAfter = await InventoryService.calculateWeightedAverageCost(driverId)
      expect(wacAfter).toBe(100)

      // 6. Verify Downstream Transfer has automatically recalculated its carried cost to 100!
      const t1Refetched = await TransactionService.getById(t1.id)
      expect(t1Refetched?.unitCost).toBe(100)
      expect(t1Refetched?.averageCostSnapshot).toBe(100)

      // 7. Verify Downstream Sale has recalculated its WAC snapshot to 100 and updated profit to 20000 cents!
      const s1Refetched = await TransactionService.getById(s1.id)
      expect(s1Refetched?.averageCostSnapshot).toBe(100)
      expect(s1Refetched?.profitSnapshot).toBe(20000) // 200 * (200 - 100) = 20000
    })
  })

  // ----------------------------------------------------
  // C. SOFT DELETE RECONCILIATIONS
  // ----------------------------------------------------
  describe('Soft-Delete & Restore Reconciliations', () => {
    it('should correctly reverse WAC and stock levels on soft-delete, and restore them back', async () => {
      // Create Driver C
      const dc = await DriverService.createDriver(
        {
          id: crypto.randomUUID(),
          name: 'Transporter Gamma',
          phone: '+77777',
        },
        operator
      )
      const driverCId = dc.id

      // Purchase A: 2000L @ 110 cents
      await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: driverCId,
          quantity: 2000,
          unitCost: 110,
          transactionDate: '2026-07-05',
          referenceNumber: 'VEH-PUR-03',
        },
        operator
      )

      // Purchase B: 1000L @ 140 cents -> WAC = (2000*110 + 1000*140)/3000 = 120
      const pb = await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: driverCId,
          quantity: 1000,
          unitCost: 140,
          transactionDate: '2026-07-05',
          referenceNumber: 'VEH-PUR-03',
        },
        operator
      )

      const stockBefore = await InventoryService.calculateInventory(driverCId)
      const wacBefore = await InventoryService.calculateWeightedAverageCost(driverCId)
      expect(stockBefore).toBe(3000)
      expect(wacBefore).toBe(120)

      // Soft delete Purchase B
      await TransactionService.deleteTransaction(pb.id, operator)

      const stockAfterDelete = await InventoryService.calculateInventory(driverCId)
      const wacAfterDelete = await InventoryService.calculateWeightedAverageCost(driverCId)
      expect(stockAfterDelete).toBe(2000)
      expect(wacAfterDelete).toBe(110) // should reverse WAC back to Purchase A level

      // Restore Purchase B
      await TransactionService.restoreTransaction(pb.id, operator)

      const stockAfterRestore = await InventoryService.calculateInventory(driverCId)
      const wacAfterRestore = await InventoryService.calculateWeightedAverageCost(driverCId)
      expect(stockAfterRestore).toBe(3000)
      expect(wacAfterRestore).toBe(120) // should restore correctly
    })
  })
})
