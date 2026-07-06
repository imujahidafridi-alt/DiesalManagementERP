import { db } from '../db'
import { transactions, drivers, customers, auditLogs } from '../schema/schema'
import { isNull, desc, asc } from 'drizzle-orm'
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
   * Helper to filter transactions based on global filters
   */
  private static async getFilteredTransactions(filters?: ReportFilters): Promise<Transaction[]> {
    // Fetch all active transactions chronologically
    const all = await db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(asc(transactions.transactionDate), asc(transactions.createdAt))

    if (!filters) return all

    return all.filter((tx) => {
      // 1. Date Range
      if (filters.startDate && tx.transactionDate < filters.startDate) return false
      if (filters.endDate && tx.transactionDate > filters.endDate) return false

      // 2. Driver filter
      if (filters.driverId) {
        const isSource = tx.sourceType === 'DRIVER' && tx.sourceId === filters.driverId
        const isDest = tx.destinationType === 'DRIVER' && tx.destinationId === filters.driverId
        if (!isSource && !isDest) return false
      }

      // 3. Customer filter
      if (filters.customerId) {
        const isSource = tx.sourceType === 'CUSTOMER' && tx.sourceId === filters.customerId
        const isDest = tx.destinationType === 'CUSTOMER' && tx.destinationId === filters.customerId
        if (!isSource && !isDest) return false
      }

      // 4. Supplier filter
      if (filters.supplierId) {
        const isSource = tx.sourceType === 'SUPPLIER' && tx.sourceId === filters.supplierId
        const isDest = tx.destinationType === 'SUPPLIER' && tx.destinationId === filters.supplierId
        if (!isSource && !isDest) return false
      }

      // 6. Transaction Type
      if (filters.transactionType && tx.transactionType !== filters.transactionType) return false

      // 7. Reference Number (loose check)
      if (filters.referenceNumber && !tx.referenceNumber?.toLowerCase().includes(filters.referenceNumber.toLowerCase())) {
        return false
      }

      // 8. Operator (createdBy check)
      if (filters.operator && !tx.createdBy.toLowerCase().includes(filters.operator.toLowerCase())) {
        return false
      }

      // 9. Notes (loose check)
      if (filters.notes && !tx.notes?.toLowerCase().includes(filters.notes.toLowerCase())) {
        return false
      }

      // 10. Quantity Range
      if (filters.minQuantity !== undefined && tx.quantity < filters.minQuantity) return false
      if (filters.maxQuantity !== undefined && tx.quantity > filters.maxQuantity) return false

      // 11. Rate Range (sellingRate for SALE, unitCost for others)
      const rate = tx.transactionType === 'SALE' ? tx.sellingRate : tx.unitCost
      if (filters.minRate !== undefined && rate < filters.minRate) return false
      if (filters.maxRate !== undefined && rate > filters.maxRate) return false

      // 12. Amount Range (quantity * rate)
      const amount = Math.round(tx.quantity * (tx.transactionType === 'SALE' ? tx.sellingRate : tx.unitCost))
      if (filters.minAmount !== undefined && amount < filters.minAmount) return false
      if (filters.maxAmount !== undefined && amount > filters.maxAmount) return false

      // 13. Profit Range (profitSnapshot)
      if (filters.minProfit !== undefined && tx.profitSnapshot < filters.minProfit) return false
      if (filters.maxProfit !== undefined && tx.profitSnapshot > filters.maxProfit) return false

      return true
    })
  }

  /**
   * Daily summary: group stats by date
   */
  static async getDailySummaryReport(filters?: ReportFilters) {
    const txs = await this.getFilteredTransactions(filters)
    const grouped: Record<string, {
      date: string
      purchasesQty: number
      purchasesAmt: number
      salesQty: number
      salesRevenue: number
      salesProfit: number
      transfersQty: number
      returnsQty: number
    }> = {}

    for (const tx of txs) {
      const date = tx.transactionDate
      if (!grouped[date]) {
        grouped[date] = {
          date,
          purchasesQty: 0,
          purchasesAmt: 0,
          salesQty: 0,
          salesRevenue: 0,
          salesProfit: 0,
          transfersQty: 0,
          returnsQty: 0,
        }
      }

      const row = grouped[date]
      if (tx.transactionType === 'PURCHASE') {
        row.purchasesQty += tx.quantity
        row.purchasesAmt += Math.round(tx.quantity * tx.unitCost)
      } else if (tx.transactionType === 'SALE') {
        row.salesQty += tx.quantity
        row.salesRevenue += Math.round(tx.quantity * tx.sellingRate)
        row.salesProfit += tx.profitSnapshot
      } else if (tx.transactionType === 'TRANSFER') {
        row.transfersQty += tx.quantity
      } else if (tx.transactionType === 'RETURN') {
        row.returnsQty += tx.quantity
      }
    }

    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date))
  }

  /**
   * Monthly summary: group stats by YYYY-MM
   */
  static async getMonthlySummaryReport(filters?: ReportFilters) {
    const txs = await this.getFilteredTransactions(filters)
    const grouped: Record<string, {
      month: string
      purchasesQty: number
      purchasesAmt: number
      salesQty: number
      salesRevenue: number
      salesProfit: number
      transfersQty: number
      returnsQty: number
    }> = {}

    for (const tx of txs) {
      const month = tx.transactionDate.substring(0, 7) // YYYY-MM
      if (!grouped[month]) {
        grouped[month] = {
          month,
          purchasesQty: 0,
          purchasesAmt: 0,
          salesQty: 0,
          salesRevenue: 0,
          salesProfit: 0,
          transfersQty: 0,
          returnsQty: 0,
        }
      }

      const row = grouped[month]
      if (tx.transactionType === 'PURCHASE') {
        row.purchasesQty += tx.quantity
        row.purchasesAmt += Math.round(tx.quantity * tx.unitCost)
      } else if (tx.transactionType === 'SALE') {
        row.salesQty += tx.quantity
        row.salesRevenue += Math.round(tx.quantity * tx.sellingRate)
        row.salesProfit += tx.profitSnapshot
      } else if (tx.transactionType === 'TRANSFER') {
        row.transfersQty += tx.quantity
      } else if (tx.transactionType === 'RETURN') {
        row.returnsQty += tx.quantity
      }
    }

    return Object.values(grouped).sort((a, b) => b.month.localeCompare(a.month))
  }

  /**
   * Yearly summary: group stats by YYYY
   */
  static async getYearlySummaryReport(filters?: ReportFilters) {
    const txs = await this.getFilteredTransactions(filters)
    const grouped: Record<string, {
      year: string
      purchasesQty: number
      purchasesAmt: number
      salesQty: number
      salesRevenue: number
      salesProfit: number
      transfersQty: number
      returnsQty: number
    }> = {}

    for (const tx of txs) {
      const year = tx.transactionDate.substring(0, 4) // YYYY
      if (!grouped[year]) {
        grouped[year] = {
          year,
          purchasesQty: 0,
          purchasesAmt: 0,
          salesQty: 0,
          salesRevenue: 0,
          salesProfit: 0,
          transfersQty: 0,
          returnsQty: 0,
        }
      }

      const row = grouped[year]
      if (tx.transactionType === 'PURCHASE') {
        row.purchasesQty += tx.quantity
        row.purchasesAmt += Math.round(tx.quantity * tx.unitCost)
      } else if (tx.transactionType === 'SALE') {
        row.salesQty += tx.quantity
        row.salesRevenue += Math.round(tx.quantity * tx.sellingRate)
        row.salesProfit += tx.profitSnapshot
      } else if (tx.transactionType === 'TRANSFER') {
        row.transfersQty += tx.quantity
      } else if (tx.transactionType === 'RETURN') {
        row.returnsQty += tx.quantity
      }
    }

    return Object.values(grouped).sort((a, b) => b.year.localeCompare(a.year))
  }

  /**
   * Profit Analysis
   */
  static async getProfitAnalysis(filters?: ReportFilters) {
    const txs = await this.getFilteredTransactions(filters)
    const sales = txs.filter((t) => t.transactionType === 'SALE')

    let totalQuantitySold = 0
    let revenue = 0
    let cost = 0
    let grossProfit = 0

    const customerStats: Record<string, { customerId: string; companyName: string; quantity: number; revenue: number; profit: number }> = {}
    const driverStats: Record<string, { driverId: string; name: string; quantity: number; revenue: number; profit: number }> = {}
    const dayStats: Record<string, { date: string; quantity: number; revenue: number; profit: number }> = {}

    // Resolve drivers and customers lists for mapping
    const allCustomers = await db.select().from(customers)
    const allDrivers = await db.select().from(drivers)

    for (const tx of sales) {
      const txRev = Math.round(tx.quantity * tx.sellingRate)
      const txCost = Math.round(tx.quantity * tx.averageCostSnapshot)

      totalQuantitySold += tx.quantity
      revenue += txRev
      cost += txCost
      grossProfit += tx.profitSnapshot

      // Customer
      const cust = allCustomers.find((c) => c.id === tx.destinationId)
      const custName = cust ? cust.companyName : 'Unknown Customer'
      if (!customerStats[tx.destinationId]) {
        customerStats[tx.destinationId] = {
          customerId: tx.destinationId,
          companyName: custName,
          quantity: 0,
          revenue: 0,
          profit: 0,
        }
      }
      customerStats[tx.destinationId].quantity += tx.quantity
      customerStats[tx.destinationId].revenue += txRev
      customerStats[tx.destinationId].profit += tx.profitSnapshot

      // Driver
      const drv = allDrivers.find((d) => d.id === tx.sourceId)
      const drvId = drv ? drv.id : tx.sourceId
      const drvName = drv ? drv.name : 'Unknown Driver'
      if (!driverStats[drvId]) {
        driverStats[drvId] = {
          driverId: drvId,
          name: drvName,
          quantity: 0,
          revenue: 0,
          profit: 0,
        }
      }
      driverStats[drvId].quantity += tx.quantity
      driverStats[drvId].revenue += txRev
      driverStats[drvId].profit += tx.profitSnapshot

      // Date
      const date = tx.transactionDate
      if (!dayStats[date]) {
        dayStats[date] = {
          date,
          quantity: 0,
          revenue: 0,
          profit: 0,
        }
      }
      dayStats[date].quantity += tx.quantity
      dayStats[date].revenue += txRev
      dayStats[date].profit += tx.profitSnapshot
    }

    const averageMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0 // percentage e.g. 15.54%
    const profitPerLiter = totalQuantitySold > 0 ? Math.round(grossProfit / totalQuantitySold) : 0 // in cents

    return {
      summary: {
        totalQuantitySold,
        revenue,
        cost,
        grossProfit,
        averageMargin,
        profitPerLiter,
      },
      topCustomers: Object.values(customerStats).sort((a, b) => b.profit - a.profit).slice(0, 10),
      topDrivers: Object.values(driverStats).sort((a, b) => b.profit - a.profit).slice(0, 10),
      bestSellingDays: Object.values(dayStats).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      highestRevenueDays: Object.values(dayStats).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      highestProfitDays: Object.values(dayStats).sort((a, b) => b.profit - a.profit).slice(0, 10),
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
    const allDrivers = await db.select().from(drivers)
    for (const snap of snapshots) {
      // Check if driver
      const drv = allDrivers.find((d) => d.id === snap.item)
      
      let name = snap.item
      let type: 'DRIVER' = 'DRIVER'
      let capacity = 9999999 // default large capacity

      if (drv) {
        name = drv.name
      }

      // Respect date filter if upToDate is passed
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
   * Transaction History (General register with advanced filters)
   */
  static async getTransactionHistory(filters?: ReportFilters) {
    return this.getFilteredTransactions(filters)
  }

  /**
   * Exception Report: finds outliers or data anomalies
   */
  static async getExceptionReport(filters?: ReportFilters) {
    const exceptions: any[] = []
    const txs = await this.getFilteredTransactions(filters)
    for (const tx of txs) {
      if (tx.transactionType === 'SALE' && tx.sellingRate === 0) {
        exceptions.push({
          type: 'ZERO_RATE',
          severity: 'HIGH',
          description: `Sale ${tx.transactionNumber} has a zero selling rate.`,
          transactionDate: tx.transactionDate,
          refId: tx.id,
        })
      }
    }
    // 2. Check for negative stocks in drivers dynamically
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

    // Apply basic filter limits
    return exceptions.filter((ex) => {
      if (filters?.startDate && ex.transactionDate < filters.startDate) return false
      if (filters?.endDate && ex.transactionDate > filters.endDate) return false
      return true
    })
  }

  /**
   * Audit log helper
   */
  static async getAuditReport(filters?: ReportFilters) {
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))

    return logs.filter((log) => {
      if (filters?.startDate && log.timestamp.split('T')[0] < filters.startDate) return false
      if (filters?.endDate && log.timestamp.split('T')[0] > filters.endDate) return false
      if (filters?.operator && !log.user.toLowerCase().includes(filters.operator.toLowerCase())) return false
      if (filters?.notes && !log.newData?.toLowerCase().includes(filters.notes.toLowerCase())) return false
      return true
    })
  }
}
