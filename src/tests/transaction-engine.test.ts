import { describe, it, expect, beforeAll } from 'vitest'
import { runMigrations } from '../database/migrator'
import { DriverService } from '../database/services/DriverService'
import { SupplierService } from '../database/services/SupplierService'
import { CustomerService } from '../database/services/CustomerService'
import { TransactionService } from '../database/services/TransactionService'
import { InventoryService } from '../database/services/InventoryService'
import { AuditService } from '../database/services/AuditService'
import crypto from 'crypto'

describe('Transaction Engine Core & Chronological Stock Rebuilding Integration Tests', () => {
  let supplierId: string
  let customerId: string
  let driver1Id: string
  let driver2Id: string
  const operator = 'Audit Admin'

  beforeAll(async () => {
    runMigrations()

    // 1. Seed Supplier
    const s = await SupplierService.createSupplier(
      {
        id: crypto.randomUUID(),
        companyName: 'Bulk Diesel wholesale',
        contactPerson: 'Refinery Agent',
        phone: '+12345',
      },
      operator
    )
    supplierId = s.id

    // 2. Seed Customer
    const c = await CustomerService.createCustomer(
      {
        id: crypto.randomUUID(),
        companyName: 'Heavy Transport Logistics',
        contactPerson: 'Operations Mgr',
        phone: '+67890',
      },
      operator
    )
    customerId = c.id

    // 3. Seed Drivers
    const d1 = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Transporter Alpha',
        phone: '+11111',
      },
      operator
    )
    driver1Id = d1.id

    const d2 = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Transporter Beta',
        phone: '+22222',
      },
      operator
    )
    driver2Id = d2.id
  })

  // ----------------------------------------------------
  // A. PURCHASE FLOW & WEIGHTED AVERAGE COST
  // ----------------------------------------------------
  describe('Purchase Flow & WAC', () => {
    it('should successfully execute a purchase and calculate running WAC', async () => {
      // Driver 1 initial stock
      const location = driver1Id
      const stock0 = await InventoryService.calculateInventory(location)
      expect(stock0).toBe(0)

      // Purchase 1: 5,000L @ $1.20 (120 cents) per liter to Driver 1
      const p1 = await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: location,
          quantity: 5000,
          unitCost: 120,
          referenceNumber: 'VEH-D1',
          transactionDate: '2026-07-05',
          notes: 'First bulk import',
        },
        operator
      )

      expect(p1.transactionNumber).toBe('PUR-000001')
      expect(p1.averageCostSnapshot).toBe(120)

      const stock1 = await InventoryService.calculateInventory(location)
      const wac1 = await InventoryService.calculateWeightedAverageCost(location)
      expect(stock1).toBe(5000)
      expect(wac1).toBe(120)

      // Purchase 2: 3,000L @ $1.40 (140 cents) per liter
      // New WAC = (5000 * 120 + 3000 * 140) / 8000 = (600,000 + 420,000) / 8000 = 1,020,000 / 8000 = 127.5 -> round to 128
      const p2 = await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: location,
          quantity: 3000,
          unitCost: 140,
          referenceNumber: 'VEH-D1',
          transactionDate: '2026-07-05',
        },
        operator
      )

      expect(p2.transactionNumber).toBe('PUR-000002')
      expect(p2.averageCostSnapshot).toBe(128)

      const stock2 = await InventoryService.calculateInventory(location)
      const wac2 = await InventoryService.calculateWeightedAverageCost(location)
      expect(stock2).toBe(8000)
      expect(wac2).toBe(128)
    })
  })

  // ----------------------------------------------------
  // B. TRANSFER FLOW & VALIDATIONS
  // ----------------------------------------------------
  describe('Transfer Flow', () => {
    it('should block transfers if quantity is negative or zero', async () => {
      await expect(
        TransactionService.createTransfer(
          {
            fromDriverId: driver1Id,
            toDriverId: driver2Id,
            quantity: 0,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow()
    })

    it('should block self-transfers', async () => {
      await expect(
        TransactionService.createTransfer(
          {
            fromDriverId: driver1Id,
            toDriverId: driver1Id,
            quantity: 100,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow('Cannot transfer fuel to the same driver')
    })

    it('should block transfers when source driver has insufficient stock', async () => {
      await expect(
        TransactionService.createTransfer(
          {
            fromDriverId: driver2Id,
            toDriverId: driver1Id,
            quantity: 500,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow('Insufficient stock')
    })

    it('should successfully transfer fuel carrying the correct cost WAC snapshot', async () => {
      // 1. Initial purchase to Driver 1 (WAC is 128 cents)
      const initialLoad = await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: driver1Id,
          quantity: 4000,
          unitCost: 128,
          referenceNumber: 'VEH-D1',
          transactionDate: '2026-07-05',
        },
        operator
      )

      expect(initialLoad.averageCostSnapshot).toBe(128)

      // Total driver 1 stock now: 8000 + 4000 = 12000
      const d1Stock = await DriverService.calculateDriverBalance(driver1Id)
      expect(d1Stock).toBe(12000)

      // 2. Transfer 1,500L from Driver 1 to Driver 2
      const driverTransfer = await TransactionService.createTransfer(
        {
          fromDriverId: driver1Id,
          toDriverId: driver2Id,
          quantity: 1500,
          referenceNumber: 'TRF-D1-D2',
          transactionDate: '2026-07-05',
        },
        operator
      )

      expect(driverTransfer.transactionNumber).toBe('TRF-000001')
      expect(driverTransfer.averageCostSnapshot).toBe(128) // inherits cost value

      const d1Balance = await DriverService.calculateDriverBalance(driver1Id)
      const d2Balance = await DriverService.calculateDriverBalance(driver2Id)
      expect(d1Balance).toBe(10500) // 12000 - 1500
      expect(d2Balance).toBe(1500)
    })
  })

  // ----------------------------------------------------
  // C. SALE FLOW & PROFIT CALCULATIONS
  // ----------------------------------------------------
  describe('Sale Flow & Profit Margins', () => {
    it('should record a sale, deduct driver balance, and snapshot COGS and profits', async () => {
      // Driver 2 selling 1,000L @ $2.00 (200 cents) per liter to Customer
      // Cost value: WAC of Driver 2 = 128 cents
      // Revenue = 1000 * 200 = 200,000 cents
      // Cost = 1000 * 128 = 128,000 cents
      // Profit = 200,000 - 128,000 = 72,000 cents
      const sale = await TransactionService.createSale(
        {
          driverId: driver2Id,
          customerId,
          quantity: 1000,
          sellingRate: 200,
          referenceNumber: 'SAL-01',
          transactionDate: '2026-07-05',
          notes: 'Standard trade',
        },
        operator
      )

      expect(sale.transactionNumber).toBe('SAL-000001')
      expect(sale.averageCostSnapshot).toBe(128)
      expect(sale.profitSnapshot).toBe(72000)

      const d2Balance = await DriverService.calculateDriverBalance(driver2Id)
      expect(d2Balance).toBe(500) // 1500L - 1000L sold

      // Verify customer statement
      const custStatement = await CustomerService.getCustomerStatement(customerId)
      expect(custStatement.totalPurchased).toBe(1000)
      expect(custStatement.totalInvoiced).toBe(200000)
    })
  })

  // ----------------------------------------------------
  // D. RETURNS & ADJUSTMENTS FLOW
  // ----------------------------------------------------
  describe('Returns & Adjustments Flow', () => {
    it('should process customer return and reverse customer debt and stock', async () => {
      // Customer returns 200L of diesel back to Driver 2
      // Customer balance credited, driver stock increases
      const ret = await TransactionService.createReturn(
        {
          returnType: 'CUSTOMER_RETURN',
          sourceId: customerId,
          destinationId: driver2Id,
          quantity: 200,
          costOrRate: 200, // refund rate in cents
          transactionDate: '2026-07-05',
        },
        operator
      )

      expect(ret.transactionNumber).toBe('RET-000001')

      const d2Balance = await DriverService.calculateDriverBalance(driver2Id)
      expect(d2Balance).toBe(700) // 500L + 200L returned

      const custStatement = await CustomerService.getCustomerStatement(customerId)
      expect(custStatement.totalPurchased).toBe(800) // 1000L - 200L
      expect(custStatement.totalPaid).toBe(40000) // 200L * 200 cents refunded/credited
      expect(custStatement.currentBalance).toBe(160000) // 200,000 - 40,000 = 160,000 cents
    })

    it('should process stock adjustments and enforce audit logging', async () => {
      // Increase Driver 1 stock by 500L as adjustment
      const adj = await TransactionService.createAdjustment(
        {
          locationId: driver1Id,
          locationType: 'DRIVER',
          adjustmentType: 'INCREASE',
          quantity: 500,
          notes: 'Dip measurement correction',
          transactionDate: '2026-07-05',
        },
        operator
      )

      expect(adj.transactionNumber).toBe('ADJ-000001')
      expect(adj.notes).toBe('Dip measurement correction')

      // Driver 1 stock: 10500 - 1500(transfer) + 500(adjustment) = 9500
      // Wait, let's calculate carefully. Driver 1 initial:
      // Test 1: Purchase 5000L + Purchase 3000L = 8000L
      // Test 2: Purchase 4000L = 12000L.
      // Transfer 1500L to Driver 2 -> 10500L remaining.
      // Adjustment + 500L -> 11000L.
      const d1Stock = await InventoryService.calculateInventory(driver1Id)
      expect(d1Stock).toBe(11000)

      // Verify audit trail logged
      const audits = await AuditService.list('transactions', adj.id)
      expect(audits.length).toBe(1)
      expect(audits[0].action).toBe('CREATE')
    })
  })

  // ----------------------------------------------------
  // E. SOFT DELETE & RESTORATION
  // ----------------------------------------------------
  describe('Soft Delete & Restoration', () => {
    it('should soft-delete transaction, update inventory snapshots, and allow restoration', async () => {
      // Let's create an isolated purchase
      const tempPur = await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: driver1Id,
          quantity: 1000,
          unitCost: 100,
          referenceNumber: 'VEH-D1',
          transactionDate: '2026-07-05',
        },
        operator
      )

      const stockBeforeDelete = await InventoryService.calculateInventory(driver1Id)
      expect(stockBeforeDelete).toBe(12000) // 11000 + 1000

      // Soft delete the purchase
      await TransactionService.deleteTransaction(tempPur.id, operator)

      // Stock calculation should ignore soft-deleted purchase
      const stockAfterDelete = await InventoryService.calculateInventory(driver1Id)
      expect(stockAfterDelete).toBe(11000)

      // Restore the transaction
      await TransactionService.restoreTransaction(tempPur.id, operator)

      const stockAfterRestore = await InventoryService.calculateInventory(driver1Id)
      expect(stockAfterRestore).toBe(12000)
    })
  })

  // ----------------------------------------------------
  // F. TRANSACTION ATOMICITY & ROLLBACKS
  // ----------------------------------------------------
  describe('Atomic Transactions', () => {
    it('should rollback all db writes if one step in a transaction throws an error', async () => {
      const stockBefore = await InventoryService.calculateInventory(driver1Id)

      // Attempt to execute a transfer of 50,000L (exceeds stock) from Driver 1 to Driver 2
      // This will throw InsufficientInventoryError inside db.transaction() block
      await expect(
        TransactionService.createTransfer(
          {
            fromDriverId: driver1Id,
            toDriverId: driver2Id,
            quantity: 50000,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow('Insufficient stock')

      // Ensure no rows were written and stock is unmodified
      const stockAfter = await InventoryService.calculateInventory(driver1Id)
      expect(stockAfter).toBe(stockBefore)
    })
  })
})
