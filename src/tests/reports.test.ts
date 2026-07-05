import { describe, it, expect, beforeAll } from 'vitest'
import { runMigrations } from '../database/migrator'
import { DriverService } from '../database/services/DriverService'
import { SupplierService } from '../database/services/SupplierService'
import { CustomerService } from '../database/services/CustomerService'
import { TransactionService } from '../database/services/TransactionService'
import { ReportService } from '../database/services/ReportService'
import crypto from 'crypto'
import { db } from '../database/db'
import { transactions } from '../database/schema/schema'

describe('Reporting, Analytics & Search Integration Tests', () => {
  let supplierId: string
  let customerAId: string
  let customerBId: string
  let driverId: string
  const operator = 'Report Auditor'

  beforeAll(async () => {
    // Run migrations on fresh memory DB
    runMigrations()

    // 1. Seed Supplier
    const s = await SupplierService.createSupplier(
      {
        id: crypto.randomUUID(),
        companyName: 'Shell Terminal Ref',
        contactPerson: 'Refinery Boss',
        phone: '+999123',
        address: 'Harbor refinery',
      },
      operator
    )
    supplierId = s.id

    // 2. Seed Customers
    const ca = await CustomerService.createCustomer(
      {
        id: crypto.randomUUID(),
        companyName: 'Construction Corp',
        contactPerson: 'Alice',
        phone: '+12345',
        address: 'Sector 10',
      },
      operator
    )
    customerAId = ca.id

    const cb = await CustomerService.createCustomer(
      {
        id: crypto.randomUUID(),
        companyName: 'Mining Aggregates',
        contactPerson: 'Bob',
        phone: '+67890',
        address: 'Quarry B',
      },
      operator
    )
    customerBId = cb.id

    const da = await DriverService.createDriver(
      {
        id: crypto.randomUUID(),
        name: 'Report Driver',
        phone: '+555444',
      },
      operator
    )
    driverId = da.id

    // 5. Seed Transactions for reporting validation
    // Purchase 1: 5000L @ $1.20 (120 cents) per liter on 2026-06-15 directly to driverId
    await TransactionService.createPurchase(
      {
        supplierId,
        destinationLocation: driverId,
        quantity: 5000,
        unitCost: 120,
        transactionDate: '2026-06-15',
        referenceNumber: 'RPT-777',
        notes: 'Bulk stock load',
      },
      operator
    )

    // Sale 1: 1500L sold to customerA @ $2.00 (200 cents) per liter on 2026-06-20
    // Profit: 1500 * (200 - 120) = 120,000 cents ($1200.00)
    await TransactionService.createSale(
      {
        driverId,
        customerId: customerAId,
        quantity: 1500,
        sellingRate: 200,
        transactionDate: '2026-06-20',
        referenceNumber: 'SAL-0620',
        notes: 'Supply A',
      },
      operator
    )

    // Sale 2: 1000L sold to customerB @ $2.20 (220 cents) per liter on 2026-07-01
    // Profit: 1000 * (220 - 120) = 100,000 cents ($1000.00)
    await TransactionService.createSale(
      {
        driverId,
        customerId: customerBId,
        quantity: 1000,
        sellingRate: 220,
        transactionDate: '2026-07-01',
        referenceNumber: 'SAL-0701',
        notes: 'Supply B',
      },
      operator
    )
  })

  // ----------------------------------------------------
  // A. PROFIT ANALYSIS REPORT TESTS
  // ----------------------------------------------------
  describe('Profit Analysis Report', () => {
    it('should aggregate lifetime revenue, costs, and profits correctly', async () => {
      const stats = await ReportService.getProfitAnalysis()
      
      // Total sales quantity: 1500 + 1000 = 2500L
      expect(stats.summary.totalQuantitySold).toBe(2500)
      
      // Total Revenue: 1500 * 200 + 1000 * 220 = 300,000 + 220,000 = 520,000 cents
      expect(stats.summary.revenue).toBe(520000)
      
      // Total Cost (COGS): 2500 * 120 = 300,000 cents
      expect(stats.summary.cost).toBe(300000)
      
      // Total Profit: 520,000 - 300,000 = 220,000 cents ($2,200.00)
      expect(stats.summary.grossProfit).toBe(220000)
      
      // Average Margin %: (220,000 / 520,000) * 100 = 42.3%
      expect(stats.summary.averageMargin).toBeCloseTo(42.3, 1)

      // Best selling customer should be customerA (1,500L)
      expect(stats.topCustomers[0].quantity).toBe(1500)
      expect(stats.topCustomers[0].companyName).toBe('Construction Corp')

      // Best selling driver should be Report Driver
      expect(stats.topDrivers[0].quantity).toBe(2500)
      expect(stats.topDrivers[0].name).toBe('Report Driver')
    })

    it('should support date range filtering on profit analysis', async () => {
      // Filter for June only (should exclude Sale 2)
      const statsJune = await ReportService.getProfitAnalysis({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      })
      expect(statsJune.summary.totalQuantitySold).toBe(1500)
      expect(statsJune.summary.revenue).toBe(300000)
      expect(statsJune.summary.grossProfit).toBe(120000)
    })
  })

  // ----------------------------------------------------
  // B. INVENTORY VALUATION & STATISTICS PERIODS
  // ----------------------------------------------------
  describe('Inventory Valuation & Period Summaries', () => {
    it('should calculate current stock and asset values per storage location', async () => {
      const val = await ReportService.getInventoryValuation()
      
      // We expect valuation records for Driver
      const driverVal = val.find((v: any) => v.locationId === driverId)

      expect(driverVal).toBeDefined()

      // Driver stock balance: 5000L purchased - 1500L sold (June) - 1000L sold (July) = 2500L
      expect(driverVal?.currentStock).toBe(2500)
      expect(driverVal?.weightedAverageCost).toBe(120)
      expect(driverVal?.totalAssetValue).toBe(2500 * 120)
    })

    it('should group transactions into daily, monthly, and yearly summaries correctly', async () => {
      // Monthly Summary
      const monthly = await ReportService.getMonthlySummaryReport()
      
      // Should have June (06) and July (07)
      const june = monthly.find((m) => m.month === '2026-06')
      const july = monthly.find((m) => m.month === '2026-07')

      expect(june).toBeDefined()
      expect(july).toBeDefined()

      // June Purchases: 5,000L. June Sales: 1,500L.
      expect(june?.purchasesQty).toBe(5000)
      expect(june?.salesQty).toBe(1500)
      expect(june?.salesProfit).toBe(120000)

      // July Purchases: 0. July Sales: 1,000L.
      expect(july?.purchasesQty).toBe(0)
      expect(july?.salesQty).toBe(1000)
      expect(july?.salesProfit).toBe(100000)
    })
  })

  // ----------------------------------------------------
  // C. EXCEPTION AUDIT CHECKS
  // ----------------------------------------------------
  describe('Exception Reports Audit', () => {
    it('should flag anomalies like zero rate transactions or capacity breaches', async () => {
      // Direct database insert to bypass validation and simulate zero-rate data anomaly
      await db.insert(transactions).values({
        id: crypto.randomUUID(),
        transactionNumber: 'SAL-ZERO',
        transactionType: 'SALE',
        sourceType: 'DRIVER',
        sourceId: driverId,
        destinationType: 'CUSTOMER',
        destinationId: customerAId,
        quantity: 10,
        unitCost: 120,
        sellingRate: 0, // zero rate exception!
        averageCostSnapshot: 120,
        profitSnapshot: -1200,
        transactionDate: '2026-07-02',
        createdBy: operator,
      })

      const exceptions = await ReportService.getExceptionReport()
      const zeroRateEx = exceptions.find((ex: any) => ex.type === 'ZERO_RATE')
      expect(zeroRateEx).toBeDefined()
      expect(zeroRateEx?.severity).toBe('HIGH')
    })
  })
})
