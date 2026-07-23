import { db } from '../db'
import { transactions, drivers, auditLogs, inventory } from '../schema/schema'
import { isNull, desc, asc, eq, and, or, gte, lte, like, sql } from 'drizzle-orm'
import { Transaction } from '../repositories/interfaces'
import { InventoryService } from './InventoryService'
import { SettingsService } from './SettingsService'

export interface ReportFilters {
  startDate?: string
  endDate?: string
  driverId?: string
  customerId?: string
  supplierId?: string
  transactionType?: string
  referenceNumber?: string
  operator?: string
  notes?: string
  minQuantity?: number
  maxQuantity?: number
  minRate?: number
  maxRate?: number
  minAmount?: number
  maxAmount?: number
  minProfit?: number
  maxProfit?: number
}

export class ReportService {
  /**
   * Helper to build filter conditions for Drizzle queries
   */
  private static buildFilterConditions(filters?: ReportFilters) {
    const conditions: any[] = [isNull(transactions.deletedAt)]
    if (!filters) return conditions

    if (filters.startDate) {
      conditions.push(gte(transactions.transactionDate, filters.startDate))
    }
    if (filters.endDate) {
      conditions.push(lte(transactions.transactionDate, filters.endDate))
    }
    if (filters.driverId) {
      conditions.push(
        or(
          and(eq(transactions.sourceType, 'DRIVER'), eq(transactions.sourceId, filters.driverId)),
          and(eq(transactions.destinationType, 'DRIVER'), eq(transactions.destinationId, filters.driverId))
        )
      )
    }
    if (filters.customerId) {
      conditions.push(
        or(
          and(eq(transactions.sourceType, 'CUSTOMER'), eq(transactions.sourceId, filters.customerId)),
          and(eq(transactions.destinationType, 'CUSTOMER'), eq(transactions.destinationId, filters.customerId))
        )
      )
    }
    if (filters.supplierId) {
      conditions.push(
        or(
          and(eq(transactions.sourceType, 'SUPPLIER'), eq(transactions.sourceId, filters.supplierId)),
          and(eq(transactions.destinationType, 'SUPPLIER'), eq(transactions.destinationId, filters.supplierId))
        )
      )
    }
    if (filters.transactionType) {
      conditions.push(eq(transactions.transactionType, filters.transactionType))
    }
    if (filters.referenceNumber) {
      conditions.push(like(transactions.referenceNumber, `%${filters.referenceNumber}%`))
    }
    if (filters.operator) {
      conditions.push(like(transactions.createdBy, `%${filters.operator}%`))
    }
    if (filters.notes) {
      conditions.push(like(transactions.notes, `%${filters.notes}%`))
    }
    if (filters.minQuantity !== undefined) {
      conditions.push(gte(transactions.quantity, filters.minQuantity))
    }
    if (filters.maxQuantity !== undefined) {
      conditions.push(lte(transactions.quantity, filters.maxQuantity))
    }
    if (filters.minRate !== undefined) {
      conditions.push(
        sql`CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.sellingRate} ELSE ${transactions.unitCost} END >= ${filters.minRate}`
      )
    }
    if (filters.maxRate !== undefined) {
      conditions.push(
        sql`CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.sellingRate} ELSE ${transactions.unitCost} END <= ${filters.maxRate}`
      )
    }
    if (filters.minAmount !== undefined) {
      conditions.push(
        sql`CAST(${transactions.quantity} * CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.sellingRate} ELSE ${transactions.unitCost} END AS INTEGER) >= ${filters.minAmount}`
      )
    }
    if (filters.maxAmount !== undefined) {
      conditions.push(
        sql`CAST(${transactions.quantity} * CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.sellingRate} ELSE ${transactions.unitCost} END AS INTEGER) <= ${filters.maxAmount}`
      )
    }
    if (filters.minProfit !== undefined) {
      conditions.push(gte(transactions.profitSnapshot, filters.minProfit))
    }
    if (filters.maxProfit !== undefined) {
      conditions.push(lte(transactions.profitSnapshot, filters.maxProfit))
    }

    return conditions
  }

  private static async getFilteredTransactions(filters?: ReportFilters): Promise<Transaction[]> {
    const conditions = this.buildFilterConditions(filters)
    return db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(asc(transactions.transactionDate), asc(transactions.createdAt))
  }

  /**
   * Daily summary: group stats by date in SQL
   */
  static async getDailySummaryReport(filters?: ReportFilters) {
    const conditions = this.buildFilterConditions(filters)
    return db
      .select({
        date: transactions.transactionDate,
        purchasesQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN ${transactions.quantity} ELSE 0 END)`,
        purchasesAmt: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN CAST(${transactions.quantity} * ${transactions.unitCost} AS INTEGER) ELSE 0 END)`,
        salesQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.quantity} ELSE 0 END)`,
        salesRevenue: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER) ELSE 0 END)`,
        salesProfit: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.profitSnapshot} ELSE 0 END)`,
        transfersQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'TRANSFER' THEN ${transactions.quantity} ELSE 0 END)`,
        returnsQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'RETURN' THEN ${transactions.quantity} ELSE 0 END)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(transactions.transactionDate)
      .orderBy(desc(transactions.transactionDate))
  }

  /**
   * Monthly summary: group stats by YYYY-MM in SQL
   */
  static async getMonthlySummaryReport(filters?: ReportFilters) {
    const conditions = this.buildFilterConditions(filters)
    const monthExpr = sql<string>`substr(${transactions.transactionDate}, 1, 7)`
    return db
      .select({
        month: monthExpr,
        purchasesQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN ${transactions.quantity} ELSE 0 END)`,
        purchasesAmt: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN CAST(${transactions.quantity} * ${transactions.unitCost} AS INTEGER) ELSE 0 END)`,
        salesQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.quantity} ELSE 0 END)`,
        salesRevenue: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER) ELSE 0 END)`,
        salesProfit: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.profitSnapshot} ELSE 0 END)`,
        transfersQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'TRANSFER' THEN ${transactions.quantity} ELSE 0 END)`,
        returnsQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'RETURN' THEN ${transactions.quantity} ELSE 0 END)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(monthExpr)
      .orderBy(desc(monthExpr))
  }

  /**
   * Yearly summary: group stats by YYYY in SQL
   */
  static async getYearlySummaryReport(filters?: ReportFilters) {
    const conditions = this.buildFilterConditions(filters)
    const yearExpr = sql<string>`substr(${transactions.transactionDate}, 1, 4)`
    return db
      .select({
        year: yearExpr,
        purchasesQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN ${transactions.quantity} ELSE 0 END)`,
        purchasesAmt: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN CAST(${transactions.quantity} * ${transactions.unitCost} AS INTEGER) ELSE 0 END)`,
        salesQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.quantity} ELSE 0 END)`,
        salesRevenue: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER) ELSE 0 END)`,
        salesProfit: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.profitSnapshot} ELSE 0 END)`,
        transfersQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'TRANSFER' THEN ${transactions.quantity} ELSE 0 END)`,
        returnsQty: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'RETURN' THEN ${transactions.quantity} ELSE 0 END)`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(yearExpr)
      .orderBy(desc(yearExpr))
  }

  /**
   * Profit Analysis optimized with subqueries/limits
   */
  static async getProfitAnalysis(filters?: ReportFilters) {
    const saleConditions = this.buildFilterConditions(filters)
    saleConditions.push(eq(transactions.transactionType, 'SALE'))

    const [summary] = await db
      .select({
        totalQuantitySold: sql<number>`SUM(${transactions.quantity})`,
        revenue: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER))`,
        cost: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.averageCostSnapshot} AS INTEGER))`,
        grossProfit: sql<number>`SUM(${transactions.profitSnapshot})`,
      })
      .from(transactions)
      .where(and(...saleConditions))

    const totalQty = summary?.totalQuantitySold || 0
    const totalRevenue = summary?.revenue || 0
    const totalCost = summary?.cost || 0
    const totalProfit = summary?.grossProfit || 0
    const averageMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0
    const profitPerLiter = totalQty > 0 ? Math.round(totalProfit / totalQty) : 0

    // Top customers via SQL group and join
    const topCustomers = await db
      .select({
        customerId: transactions.destinationId,
        companyName: sql<string>`COALESCE((SELECT company_name FROM customers WHERE id = ${transactions.destinationId}), 'Unknown Customer')`,
        quantity: sql<number>`SUM(${transactions.quantity})`,
        revenue: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER))`,
        profit: sql<number>`SUM(${transactions.profitSnapshot})`,
      })
      .from(transactions)
      .where(and(...saleConditions))
      .groupBy(transactions.destinationId)
      .orderBy(desc(sql`SUM(${transactions.profitSnapshot})`))
      .limit(10)

    // Top drivers via SQL group and join
    const topDrivers = await db
      .select({
        driverId: transactions.sourceId,
        name: sql<string>`COALESCE((SELECT name FROM drivers WHERE id = ${transactions.sourceId}), 'Unknown Driver')`,
        quantity: sql<number>`SUM(${transactions.quantity})`,
        revenue: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER))`,
        profit: sql<number>`SUM(${transactions.profitSnapshot})`,
      })
      .from(transactions)
      .where(and(...saleConditions))
      .groupBy(transactions.sourceId)
      .orderBy(desc(sql`SUM(${transactions.profitSnapshot})`))
      .limit(10)

    // Daily trends data
    const dayStats = await db
      .select({
        date: transactions.transactionDate,
        quantity: sql<number>`SUM(${transactions.quantity})`,
        revenue: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER))`,
        profit: sql<number>`SUM(${transactions.profitSnapshot})`,
      })
      .from(transactions)
      .where(and(...saleConditions))
      .groupBy(transactions.transactionDate)

    return {
      summary: {
        totalQuantitySold: totalQty,
        revenue: totalRevenue,
        cost: totalCost,
        grossProfit: totalProfit,
        averageMargin,
        profitPerLiter,
      },
      topCustomers,
      topDrivers,
      bestSellingDays: [...dayStats].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      highestRevenueDays: [...dayStats].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      highestProfitDays: [...dayStats].sort((a, b) => b.profit - a.profit).slice(0, 10),
    }
  }

  /**
   * Valuation Report
   */
  static async getInventoryValuation(filters?: ReportFilters) {
    const snapshots = await InventoryService.listSnapshots()
    const valuationReport: {
      locationId: string
      locationName: string
      locationType: 'DRIVER'
      currentStock: number
      weightedAverageCost: number
      totalAssetValue: number
      capacity: number
    }[] = []
    
    // Lookup mapping caches to avoid N+1 query loops
    const allDrivers = await db.select().from(drivers)

    for (const snap of snapshots) {
      const drv = allDrivers.find((d) => d.id === snap.item)
      let name = snap.item
      let type: 'DRIVER' = 'DRIVER'
      let capacity = 9999999

      if (drv) {
        name = drv.name
      }

      let stock = snap.currentStock
      let wac = snap.weightedAverageCost
      
      if (filters?.endDate) {
        stock = await InventoryService.calculateInventory(snap.item, filters.endDate)
        wac = await InventoryService.calculateWeightedAverageCost(snap.item, filters.endDate)
      }

      valuationReport.push({
        locationId: snap.item,
        locationName: name,
        locationType: type,
        currentStock: stock,
        weightedAverageCost: wac,
        totalAssetValue: Math.round(stock * wac),
        capacity,
      })
    }

    return valuationReport
  }

  /**
   * Transaction History (General register with advanced SQL filters)
   */
  static async getTransactionHistory(filters?: ReportFilters) {
    return this.getFilteredTransactions(filters)
  }

  /**
   * Exception Report: finds outliers or data anomalies
   */
  static async getExceptionReport(filters?: ReportFilters) {
    const exceptions: any[] = []
    
    // Find zero rate sales directly in SQL
    const zeroRateConditions = this.buildFilterConditions(filters)
    zeroRateConditions.push(eq(transactions.transactionType, 'SALE'))
    zeroRateConditions.push(eq(transactions.sellingRate, 0))

    const zeroRateSales = await db
      .select()
      .from(transactions)
      .where(and(...zeroRateConditions))

    for (const tx of zeroRateSales) {
      exceptions.push({
        type: 'ZERO_RATE',
        severity: 'HIGH',
        description: `Sale ${tx.transactionNumber} has a zero selling rate.`,
        transactionDate: tx.transactionDate,
        refId: tx.id,
      })
    }

    // Check for negative stocks in drivers dynamically
    const globalSettings = await SettingsService.getSettings()
    const unit = globalSettings.quantity_abbreviation || globalSettings.fuel_unit || 'Gal'
    const allDrivers = await db.select().from(drivers).where(isNull(drivers.deletedAt))
    for (const d of allDrivers) {
      const stock = await InventoryService.calculateInventory(d.id)
      if (stock < 0) {
        exceptions.push({
          type: 'NEG_INVENTORY',
          severity: 'HIGH',
          description: `Driver ${d.name} has a negative inventory balance of ${stock} ${unit}.`,
          transactionDate: new Date().toISOString().split('T')[0],
          refId: d.id,
        })
      }
    }

    return exceptions.filter((ex) => {
      if (filters?.startDate && ex.transactionDate < filters.startDate) return false
      if (filters?.endDate && ex.transactionDate > filters.endDate) return false
      return true
    })
  }

  /**
   * Audit log helper with SQL filters
   */
  static async getAuditReport(filters?: ReportFilters) {
    const conditions: any[] = []
    if (filters?.startDate) {
      conditions.push(gte(auditLogs.timestamp, `${filters.startDate}T00:00:00.000Z`))
    }
    if (filters?.endDate) {
      conditions.push(lte(auditLogs.timestamp, `${filters.endDate}T23:59:59.999Z`))
    }
    if (filters?.operator) {
      conditions.push(like(auditLogs.user, `%${filters.operator}%`))
    }
    if (filters?.notes) {
      conditions.push(like(auditLogs.newData, `%${filters.notes}%`))
    }
    return db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.timestamp))
  }

  /**
   * Dashboard statistics and trends aggregations
   */
  static async getDashboardData() {
    const snapshots = await InventoryService.listSnapshots()
    const allDrivers = await db.select().from(drivers)
    
    let totalStock = 0
    let totalValuation = 0
    for (const snap of snapshots) {
      const isDriver = allDrivers.some((d) => d.id === snap.item)
      if (isDriver) {
        totalStock += snap.currentStock
        totalValuation += Math.round(snap.currentStock * snap.weightedAverageCost)
      }
    }

    const todayStr = new Date().toLocaleDateString('en-CA')
    const currentMonthStr = new Date().toLocaleDateString('en-CA').slice(0, 7)

    const [todayStats] = await db
      .select({
        purchasesVol: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN ${transactions.quantity} ELSE 0 END)`,
        salesVol: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.quantity} ELSE 0 END)`,
        revenue: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER) ELSE 0 END)`,
        profit: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.profitSnapshot} ELSE 0 END)`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionDate, todayStr), isNull(transactions.deletedAt)))

    const [monthStats] = await db
      .select({
        purchasesVol: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN ${transactions.quantity} ELSE 0 END)`,
        salesVol: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.quantity} ELSE 0 END)`,
        revenue: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER) ELSE 0 END)`,
        profit: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.profitSnapshot} ELSE 0 END)`,
      })
      .from(transactions)
      .where(and(like(transactions.transactionDate, `${currentMonthStr}%`), isNull(transactions.deletedAt)))

    const [topCustomer] = await db
      .select({
        name: sql<string>`(SELECT company_name FROM customers WHERE id = ${transactions.destinationId})`,
        profit: sql<number>`SUM(${transactions.profitSnapshot})`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'SALE'), isNull(transactions.deletedAt)))
      .groupBy(transactions.destinationId)
      .orderBy(desc(sql`SUM(${transactions.profitSnapshot})`))
      .limit(1)

    const [topDriver] = await db
      .select({
        name: sql<string>`(SELECT name FROM drivers WHERE id = ${transactions.sourceId})`,
        profit: sql<number>`SUM(${transactions.profitSnapshot})`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'SALE'), isNull(transactions.deletedAt)))
      .groupBy(transactions.sourceId)
      .orderBy(desc(sql`SUM(${transactions.profitSnapshot})`))
      .limit(1)

    let maxStock = -1
    let maxStockDriverName = ''
    for (const d of allDrivers) {
      const snap = snapshots.find((s) => s.item === d.id)
      const stock = snap ? snap.currentStock : 0
      if (stock > maxStock) {
        maxStock = stock
        maxStockDriverName = d.name
      }
    }

    const globalSettings = await SettingsService.getSettings()
    const unit = globalSettings.quantity_abbreviation || globalSettings.fuel_unit || 'Gal'

    const alerts: any[] = []
    if (maxStock > 0) {
      alerts.push({
        title: 'Top Driver Stock Holder',
        desc: `Driver ${maxStockDriverName} currently holds the highest diesel stock: ${maxStock.toLocaleString()} ${unit}.`,
        type: 'info',
      })
    }

    const stockDistribution = snapshots
      .filter((snap) => snap.currentStock > 0)
      .map((snap) => {
        const drv = allDrivers.find((d) => d.id === snap.item)
        return {
          label: drv ? drv.name : snap.item,
          value: snap.currentStock,
        }
      })

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      return d.toLocaleDateString('en-CA')
    }).reverse()

    const dailySales = await Promise.all(last7Days.map(async (day) => {
      const [res] = await db
        .select({ vol: sql<number>`SUM(${transactions.quantity})` })
        .from(transactions)
        .where(and(eq(transactions.transactionType, 'SALE'), eq(transactions.transactionDate, day), isNull(transactions.deletedAt)))
      return {
        label: day.substring(5),
        value: res?.vol || 0,
      }
    }))

    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      return d.toLocaleDateString('en-CA').slice(0, 7)
    }).reverse()

    const monthlyTrends = await Promise.all(last6Months.map(async (mon) => {
      const [res] = await db
        .select({
          purchases: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'PURCHASE' THEN ${transactions.quantity} ELSE 0 END)`,
          sales: sql<number>`SUM(CASE WHEN ${transactions.transactionType} = 'SALE' THEN ${transactions.quantity} ELSE 0 END)`,
        })
        .from(transactions)
        .where(and(like(transactions.transactionDate, `${mon}%`), isNull(transactions.deletedAt)))
      return {
        label: mon,
        value: res?.sales || 0,
        secondaryValue: res?.purchases || 0,
        purchases: res?.purchases || 0,
        sales: res?.sales || 0,
      }
    }))

    // Fetch last 10 active transactions
    const recentTransactions = await db
      .select({
        id: transactions.id,
        transactionDate: transactions.transactionDate,
        transactionType: transactions.transactionType,
        quantity: transactions.quantity,
        unitCost: transactions.unitCost,
        sellingRate: transactions.sellingRate,
        createdBy: transactions.createdBy,
        sourceId: transactions.sourceId,
        destinationId: transactions.destinationId,
        sourceType: transactions.sourceType,
        destinationType: transactions.destinationType,
      })
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
      .limit(10)

    return {
      stats: {
        totalStock,
        totalValuation: totalValuation / 100,
        todayPurchasesVol: todayStats?.purchasesVol || 0,
        todaySalesVol: todayStats?.salesVol || 0,
        todayRevenueAmt: (todayStats?.revenue || 0) / 100,
        todayProfitAmt: (todayStats?.profit || 0) / 100,
        monthPurchasesVol: monthStats?.purchasesVol || 0,
        monthSalesVol: monthStats?.salesVol || 0,
        monthRevenueAmt: (monthStats?.revenue || 0) / 100,
        monthProfitAmt: (monthStats?.profit || 0) / 100,
        topCustomerName: topCustomer?.name || 'N/A',
        topDriverName: topDriver?.name || 'N/A',
        alerts,
      },
      chartData: {
        stockDistribution,
        dailySales,
        monthlyTrends,
      },
      recentTransactions,
    }
  }

  /**
   * Purchases statistics aggregation
   */
  static async getPurchasesSummary() {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const currentMonthStr = new Date().toLocaleDateString('en-CA').slice(0, 7)

    const [todayRes] = await db
      .select({
        qty: sql<number>`SUM(${transactions.quantity})`,
        amt: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.unitCost} AS INTEGER))`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'PURCHASE'), eq(transactions.transactionDate, todayStr), isNull(transactions.deletedAt)))

    const [monthRes] = await db
      .select({
        qty: sql<number>`SUM(${transactions.quantity})`,
        amt: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.unitCost} AS INTEGER))`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'PURCHASE'), like(transactions.transactionDate, `${currentMonthStr}%`), isNull(transactions.deletedAt)))

    const [totalRes] = await db
      .select({
        qty: sql<number>`SUM(${transactions.quantity})`,
        amt: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.unitCost} AS INTEGER))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'PURCHASE'), isNull(transactions.deletedAt)))

    const totalQty = totalRes?.qty || 0
    const totalAmt = totalRes?.amt || 0
    const avgRate = totalQty > 0 ? (totalAmt / totalQty) : 0

    return {
      todayQty: todayRes?.qty || 0,
      todayTotal: (todayRes?.amt || 0) / 100,
      monthQty: monthRes?.qty || 0,
      monthTotal: (monthRes?.amt || 0) / 100,
      totalQty: totalQty,
      avgRate: avgRate / 100,
      totalTransactions: totalRes?.count || 0,
    }
  }

  /**
   * Sales statistics aggregation
   */
  static async getSalesSummary() {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const currentMonthStr = new Date().toLocaleDateString('en-CA').slice(0, 7)

    const [todayRes] = await db
      .select({
        qty: sql<number>`SUM(${transactions.quantity})`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'SALE'), eq(transactions.transactionDate, todayStr), isNull(transactions.deletedAt)))

    const [monthRes] = await db
      .select({
        qty: sql<number>`SUM(${transactions.quantity})`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'SALE'), like(transactions.transactionDate, `${currentMonthStr}%`), isNull(transactions.deletedAt)))

    const [totalRes] = await db
      .select({
        qty: sql<number>`SUM(${transactions.quantity})`,
        rev: sql<number>`SUM(CAST(${transactions.quantity} * ${transactions.sellingRate} AS INTEGER))`,
        prof: sql<number>`SUM(${transactions.profitSnapshot})`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'SALE'), isNull(transactions.deletedAt)))

    const totalQty = totalRes?.qty || 0
    const totalRev = totalRes?.rev || 0
    const totalProf = totalRes?.prof || 0
    const avgPrice = totalQty > 0 ? (totalRev / totalQty) : 0
    const avgProfit = totalQty > 0 ? (totalProf / totalQty) : 0

    const depot = await db
      .select({ stock: inventory.currentStock })
      .from(inventory)
      .where(eq(inventory.item, 'Main Tank A'))
      .limit(1)
    const currentStock = depot[0]?.stock || 0

    return {
      todayQty: todayRes?.qty || 0,
      monthQty: monthRes?.qty || 0,
      totalRevenue: totalRev / 100,
      totalProfit: totalProf / 100,
      avgPrice: avgPrice / 100,
      avgProfit: avgProfit / 100,
      currentStock,
    }
  }

  /**
   * Transfers statistics aggregation
   */
  static async getTransfersSummary() {
    const todayStr = new Date().toLocaleDateString('en-CA')

    const [todayRes] = await db
      .select({
        qty: sql<number>`SUM(${transactions.quantity})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(eq(transactions.transactionType, 'TRANSFER'), eq(transactions.transactionDate, todayStr), isNull(transactions.deletedAt)))

    const todayVol = todayRes?.qty || 0
    const todayCount = todayRes?.count || 0
    const avgVol = todayCount > 0 ? (todayVol / todayCount) : 0

    return {
      todayVol,
      todayCount,
      avgVol,
    }
  }
}
