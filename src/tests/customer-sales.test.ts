import { describe, it, expect, beforeAll } from 'vitest'
import { runMigrations } from '../database/migrator'
import { DriverService } from '../database/services/DriverService'
import { SupplierService } from '../database/services/SupplierService'
import { CustomerService } from '../database/services/CustomerService'
import { TransactionService } from '../database/services/TransactionService'
import { InventoryService } from '../database/services/InventoryService'
import { ValidationError, InsufficientInventoryError, DriverNotFoundError, CustomerNotFoundError } from '../database/errors'
import crypto from 'crypto'
import { db } from '../database/db'
import { transactions } from '../database/schema/schema'
import { eq } from 'drizzle-orm'

describe('Customer Sales, Ledger & Profit Engine Integration Tests', () => {
  let supplierId: string
  let customerId: string
  let activeDriverId: string
  let inactiveDriverId: string
  
  const operator = 'Sales Auditor'

  beforeAll(async () => {
    // Run migrations on fresh in-memory SQLite database
    runMigrations()

    // 1. Seed Supplier
    const s = await SupplierService.createSupplier(
      {
        id: crypto.randomUUID(),
        companyName: 'Refinery Bulk Supplier',
        contactPerson: 'Logistics Mgr',
        phone: '+999999999',
        address: 'Terminal Dock 4',
      },
      operator
    )
    supplierId = s.id

    // 2. Seed Customer
    const c = await CustomerService.createCustomer(
      {
        id: crypto.randomUUID(),
        companyName: 'Global Logistics Co.',
        contactPerson: 'Account Manager',
        phone: '+5551234',
        address: 'Industrial Zone A',
      },
      operator
    )
    customerId = c.id

    // 3. Seed Active Driver
    const da = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Active Driver',
        phone: '+1234567',
        status: 'ACTIVE',
      },
      operator
    )
    activeDriverId = da.id

    // 4. Seed Inactive Driver
    const di = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Inactive Driver',
        phone: '+7654321',
        status: 'INACTIVE',
      },
      operator
    )
    inactiveDriverId = di.id

  })

  // ----------------------------------------------------
  // A. VALIDATION BLOCKS
  // ----------------------------------------------------
  describe('Sales Validation Blocks', () => {
    it('should block sales if quantity is zero or negative', async () => {
      await expect(
        TransactionService.createSale(
          {
            driverId: activeDriverId,
            customerId,
            quantity: 0,
            sellingRate: 150,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(ValidationError)

      await expect(
        TransactionService.createSale(
          {
            driverId: activeDriverId,
            customerId,
            quantity: -50,
            sellingRate: 150,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(ValidationError)
    })

    it('should block sales if selling rate is zero or negative', async () => {
      await expect(
        TransactionService.createSale(
          {
            driverId: activeDriverId,
            customerId,
            quantity: 100,
            sellingRate: 0,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(ValidationError)

      await expect(
        TransactionService.createSale(
          {
            driverId: activeDriverId,
            customerId,
            quantity: 100,
            sellingRate: -10,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(ValidationError)
    })

    it('should throw DriverNotFoundError if driver does not exist', async () => {
      const fakeUuid = crypto.randomUUID()
      await expect(
        TransactionService.createSale(
          {
            driverId: fakeUuid,
            customerId,
            quantity: 100,
            sellingRate: 150,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(DriverNotFoundError)
    })

    it('should throw CustomerNotFoundError if customer does not exist', async () => {
      const fakeUuid = crypto.randomUUID()
      await expect(
        TransactionService.createSale(
          {
            driverId: activeDriverId,
            customerId: fakeUuid,
            quantity: 100,
            sellingRate: 150,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(CustomerNotFoundError)
    })

    it('should block sales if driver is inactive', async () => {
      await expect(
        TransactionService.createSale(
          {
            driverId: inactiveDriverId,
            customerId,
            quantity: 100,
            sellingRate: 150,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(/is not active/)
    })


    it('should block sales if quantity exceeds stock', async () => {
      // Driver currently has 0 stock
      const stock = await InventoryService.calculateInventory(activeDriverId)
      expect(stock).toBe(0)

      await expect(
        TransactionService.createSale(
          {
            driverId: activeDriverId,
            customerId,
            quantity: 100,
            sellingRate: 150,
            transactionDate: '2026-07-05',
          },
          operator
        )
      ).rejects.toThrow(InsufficientInventoryError)
    })
  })

  // ----------------------------------------------------
  // B. SALE CREATION & PROFIT SNAPSHOTS
  // ----------------------------------------------------
  describe('Sales Creation, WAC, and Profits', () => {
    it('should calculate carrying WAC, revenue, and profit snapshots correctly on sale', async () => {
      // 1. Purchase fuel into activeDriver (4,000L @ $1.20 / 120 cents)
      await TransactionService.createPurchase(
        {
          supplierId,
          destinationLocation: activeDriverId,
          quantity: 4000,
          unitCost: 120,
          transactionDate: '2026-07-01',
          referenceNumber: 'PLATE-A',
        },
        operator
      )

      // Verify activeDriver's stock is 4,000L and carrying WAC is 120 cents
      const driverStock = await InventoryService.calculateInventory(activeDriverId)
      const driverWac = await InventoryService.calculateWeightedAverageCost(activeDriverId)
      expect(driverStock).toBe(4000)
      expect(driverWac).toBe(120)

      // 3. Sell 1,500L to customer @ $2.00 / 200 cents
      // Expected Cost: 1500 * 120 cents = 180,000 cents
      // Expected Revenue: 1500 * 200 cents = 300,000 cents
      // Expected Profit: 300,000 - 180,000 = 120,000 cents ($1,200.00)
      const sale = await TransactionService.createSale(
        {
          driverId: activeDriverId,
          customerId,
          quantity: 1500,
          sellingRate: 200,
          transactionDate: '2026-07-03',
          vehicleNumber: 'SAL-INV-001',
          notes: 'Regular business supply',
        },
        operator
      )

      expect(sale.transactionNumber).toBe('SAL-000001')
      expect(sale.averageCostSnapshot).toBe(120)
      expect(sale.profitSnapshot).toBe(120000)

      // Verify driver stock is reduced to 2,500L
      const driverStockAfter = await InventoryService.calculateInventory(activeDriverId)
      expect(driverStockAfter).toBe(2500)

      // Verify customer statement
      const statement = await CustomerService.getCustomerStatement(customerId)
      expect(statement.totalPurchased).toBe(1500)
      expect(statement.totalInvoiced).toBe(300000)
      expect(statement.totalPaid).toBe(0)
      expect(statement.currentBalance).toBe(300000)
    })
  })

  // ----------------------------------------------------
  // C. MODIFYING SALES
  // ----------------------------------------------------
  describe('Modifying Sales', () => {
    it('should recalculate stock, WAC, and profits when quantity or selling rate is updated', async () => {
      // Find the sale transaction we just created
      const activeTxs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.transactionType, 'SALE'))
      expect(activeTxs.length).toBe(1)
      const saleId = activeTxs[0].id

      // 1. Update sale: Increase quantity to 2,000L and sellingRate to $2.20 / 220 cents
      // Expected Cost: 2000 * 120 cents = 240,000 cents
      // Expected Revenue: 2000 * 220 cents = 440,000 cents
      // Expected Profit: 440,000 - 240,000 = 200,000 cents ($2,000.00)
      const updated = await TransactionService.updateSale(
        saleId,
        {
          driverId: activeDriverId,
          customerId,
          quantity: 2000,
          sellingRate: 220,
          transactionDate: '2026-07-03',
          vehicleNumber: 'SAL-INV-001-REV',
          notes: 'Updated invoice quantity and price',
        },
        operator
      )

      expect(updated.success).toBe(true)
      if (!updated.success) throw new Error('updateSale returned conflicts')
      expect(updated.data.quantity).toBe(2000)
      expect(updated.data.sellingRate).toBe(220)
      expect(updated.data.averageCostSnapshot).toBe(120)
      expect(updated.data.profitSnapshot).toBe(200000)

      // Verify driver stock is reduced to 2,000L (4000L initial - 2000L updated sale)
      const driverStockAfter = await InventoryService.calculateInventory(activeDriverId)
      expect(driverStockAfter).toBe(2000)

      // Verify customer statement shows the updated balance
      const statement = await CustomerService.getCustomerStatement(customerId)
      expect(statement.totalPurchased).toBe(2000)
      expect(statement.totalInvoiced).toBe(440000)
      expect(statement.currentBalance).toBe(440000)
    })

    it('should block modification if updated quantity exceeds driver stock', async () => {
      // Driver has 2,000L stock right now. The sale is 2,000L.
      // Total inventory available is driver stock (2000L) + sale prior quantity (2000L) = 4000L.
      // Trying to update sale to 4,500L should fail.
      const activeTxs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.transactionType, 'SALE'))
      const saleId = activeTxs[0].id

      await expect(
        TransactionService.updateSale(
          saleId,
          {
            driverId: activeDriverId,
            customerId,
            quantity: 4500,
            sellingRate: 220,
            transactionDate: '2026-07-03',
          },
          operator
        )
      ).rejects.toThrow(InsufficientInventoryError)
    })
  })

  // ----------------------------------------------------
  // D. SOFT DELETIONS & RESTORATION & DETAILED STATEMENT LINES
  // ----------------------------------------------------
  describe('Soft Deletion, Restoration and Detailed Customer Statement Reports', () => {
    it('should soft-delete sale, restore stock and balances, and skip deleted transactions in statement reports', async () => {
      const activeTxs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.transactionType, 'SALE'))
      const saleId = activeTxs[0].id

      // 1. Soft-delete the sale
      await TransactionService.deleteTransaction(saleId, operator)

      // Stock should restore back to 4,000L (since sale is soft-deleted)
      const driverStockAfterDelete = await InventoryService.calculateInventory(activeDriverId)
      expect(driverStockAfterDelete).toBe(4000)

      // Customer statement balances should go back to 0
      const statementAfterDelete = await CustomerService.getCustomerStatement(customerId)
      expect(statementAfterDelete.totalPurchased).toBe(0)
      expect(statementAfterDelete.totalInvoiced).toBe(0)
      expect(statementAfterDelete.currentBalance).toBe(0)

      // Detailed statement report should have 0 lines since the transaction is soft-deleted
      const reportAfterDelete = await CustomerService.getCustomerStatementReport(customerId)
      expect(reportAfterDelete.lines.length).toBe(0)
      expect(reportAfterDelete.summary.lifetimeVolume).toBe(0)
      expect(reportAfterDelete.summary.lifetimeAmount).toBe(0)

      // 2. Restore the transaction
      await TransactionService.restoreTransaction(saleId, operator)

      // Stock should reduce to 2000L again
      const driverStockAfterRestore = await InventoryService.calculateInventory(activeDriverId)
      expect(driverStockAfterRestore).toBe(2000)

      // Customer balances should restore
      const statementAfterRestore = await CustomerService.getCustomerStatement(customerId)
      expect(statementAfterRestore.totalPurchased).toBe(2000)
      expect(statementAfterRestore.totalInvoiced).toBe(440000)

      // Detailed report should show the sale line again
      const reportAfterRestore = await CustomerService.getCustomerStatementReport(customerId)
      expect(reportAfterRestore.lines.length).toBe(1)
      expect(reportAfterRestore.lines[0].quantity).toBe(2000)
      expect(reportAfterRestore.lines[0].sellingRate).toBe(220)
      expect(reportAfterRestore.lines[0].totalAmount).toBe(440000)
    })
  })

  // ----------------------------------------------------
  // E. ATOMICITY & ROLLBACKS
  // ----------------------------------------------------
  describe('Sales Transaction Atomicity', () => {
    it('should roll back changes if validation throws an error inside the transaction block', async () => {
      // Current stock is 2000L.
      const stockBefore = await InventoryService.calculateInventory(activeDriverId)
      expect(stockBefore).toBe(2000)

      // Let's attempt to create a sale that fails validation (e.g. quantity exceeds stock)
      await expect(
        TransactionService.createSale(
          {
            driverId: activeDriverId,
            customerId,
            quantity: 5000, // Exceeds available stock of 2000
            sellingRate: 200,
            transactionDate: '2026-07-04',
          },
          operator
        )
      ).rejects.toThrow(InsufficientInventoryError)

      // Ensure that stock remains unchanged
      const stockAfter = await InventoryService.calculateInventory(activeDriverId)
      expect(stockAfter).toBe(2000)
    })
  })
})
