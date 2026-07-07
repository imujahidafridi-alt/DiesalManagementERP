import { DriverRepository } from '../repositories/DriverRepository'
import { TransactionRepository } from '../repositories/TransactionRepository'
import { db } from '../db'
import { drivers, suppliers, customers } from '../schema/schema'
import { Driver } from '../repositories/interfaces'
import { AuditService } from './AuditService'
import { InventoryService } from './InventoryService'

const driverRepo = new DriverRepository()
const txRepo = new TransactionRepository()

export interface DriverStatement {
  totalLoaded: number // in liters
  totalSold: number // in liters
  currentStock: number // in liters
  totalSalesValue: number // in cents
  totalSalesCost: number // in cents
  derivedProfit: number // in cents
}

export class DriverService {
  /**
   * Generates a summary statement of driver purchases, sales, current inventory, and profit layers.
   */
  static async getDriverStatement(driverId: string): Promise<DriverStatement> {
    const stock = await InventoryService.calculateInventory(driverId)
    const txs = await txRepo.listByEntity(driverId)

    let totalLoaded = 0
    let totalSold = 0
    let totalSalesValue = 0
    let totalSalesCost = 0

    txs.forEach((tx) => {
      if (tx.deletedAt) return

      if (tx.transactionType === 'PURCHASE') {
        if (tx.destinationId === driverId) {
          totalLoaded += tx.quantity
        }
      } else if (tx.transactionType === 'TRANSFER') {
        if (tx.destinationId === driverId) {
          totalLoaded += tx.quantity
        } else if (tx.sourceId === driverId) {
          totalSold += tx.quantity
        }
      } else if (tx.transactionType === 'SALE') {
        if (tx.sourceId === driverId) {
          totalSold += tx.quantity
          totalSalesValue += tx.quantity * tx.sellingRate
          totalSalesCost += tx.quantity * tx.averageCostSnapshot
        }
      } else if (tx.transactionType === 'RETURN') {
        if (tx.destinationId === driverId) {
          totalLoaded += tx.quantity
        } else if (tx.sourceId === driverId) {
          totalSold += tx.quantity
        }
      } else if (tx.transactionType === 'ADJUSTMENT') {
        if (tx.destinationId === driverId) {
          totalLoaded += tx.quantity
        } else if (tx.sourceId === driverId) {
          totalSold += tx.quantity
        }
      } else if (tx.transactionType === 'OPENING_BALANCE') {
        if (tx.destinationId === driverId) {
          totalLoaded += tx.quantity
        }
      }
    })

    return {
      totalLoaded,
      totalSold,
      currentStock: stock,
      totalSalesValue,
      totalSalesCost,
      derivedProfit: totalSalesValue - totalSalesCost,
    }
  }

  /**
   * Generates a detailed statement report with opening balance, running balances, and date ranges.
   */
  static async getDriverStatementReport(
    driverId: string,
    filters?: { startDate?: string; endDate?: string }
  ): Promise<{
    driverName: string
    assignedVehiclePlate: string | null
    startDate: string | null
    endDate: string | null
    openingBalance: number
    closingBalance: number
    totalQtyIn: number
    totalQtyOut: number
    averageBuyCost: number
    lines: any[]
  }> {
    const driver = await driverRepo.getById(driverId)
    if (!driver) throw new Error(`Driver not found: ${driverId}`)

    // Fetch transactions involving this driver directly
    const txs = await txRepo.listByEntity(driverId)
    
    // Sort transactions by Transaction Date, then by Creation Time (createdAt) ascending
    const sortedTxs = [...txs].sort((a, b) => {
      if (a.transactionDate !== b.transactionDate) {
        return a.transactionDate.localeCompare(b.transactionDate)
      }
      return a.createdAt.localeCompare(b.createdAt)
    })

    const lines: any[] = []
    let openingBalance = 0
    let runningBalance = 0

    // Fetch names dynamically in batch to avoid N+1 query overheads
    const [driversList, suppliersList, customersList] = await Promise.all([
      db.select().from(drivers),
      db.select().from(suppliers),
      db.select().from(customers),
    ])

    const getEntityName = (type: string, id: string) => {
      if (type === 'SUPPLIER') return suppliersList.find((s) => s.id === id)?.companyName || 'Supplier'
      if (type === 'CUSTOMER') return customersList.find((c) => c.id === id)?.companyName || 'Customer'
      if (type === 'DRIVER') return driversList.find((d) => d.id === id)?.name || 'Driver'
      if (type === 'INVENTORY') {
        const matchingDriver = driversList.find((d) => d.id === id)
        return matchingDriver ? `Driver: ${matchingDriver.name}` : id
      }
      return id
    }

    const start = filters?.startDate || null
    const end = filters?.endDate || null

    for (const tx of sortedTxs) {
      if (tx.deletedAt) continue

      const isDest = tx.destinationId === driverId
      const delta = isDest ? tx.quantity : -tx.quantity
      const currentTxDate = tx.transactionDate

      if (start && currentTxDate < start) {
        openingBalance += delta
        runningBalance += delta
        continue
      }

      if (end && currentTxDate > end) {
        continue
      }

      runningBalance += delta

      lines.push({
        id: tx.id,
        transactionNumber: tx.transactionNumber,
        transactionType: tx.transactionType,
        transactionDate: tx.transactionDate,
        partyName: isDest ? getEntityName(tx.sourceType, tx.sourceId) : getEntityName(tx.destinationType, tx.destinationId),
        volume: tx.quantity,
        quantity: tx.quantity,
        qtyIn: isDest ? tx.quantity : 0,
        qtyOut: !isDest ? tx.quantity : 0,
        unitCost: tx.unitCost,
        sellingRate: tx.sellingRate,
        averageCostSnapshot: tx.averageCostSnapshot,
        referenceNumber: tx.referenceNumber,
        notes: tx.notes,
        runningBalance: runningBalance,
        isDest,
        sourceId: tx.sourceId,
        destinationId: tx.destinationId,
        sourceType: tx.sourceType,
        destinationType: tx.destinationType,
      })
    }

    // Compute average buy cost from purchases in the selected range
    let totalPurchaseQty = 0
    let totalPurchaseAmount = 0
    for (const line of lines) {
      if (line.transactionType === 'PURCHASE') {
        totalPurchaseQty += line.qtyIn
        totalPurchaseAmount += line.qtyIn * line.unitCost
      }
    }
    const averageBuyCost = totalPurchaseQty > 0 ? Math.round(totalPurchaseAmount / totalPurchaseQty) : 0

    return {
      driverName: driver.name,
      assignedVehiclePlate: null,
      startDate: start,
      endDate: end,
      openingBalance,
      closingBalance: runningBalance,
      totalQtyIn: lines.reduce((acc, l) => acc + l.qtyIn, 0),
      totalQtyOut: lines.reduce((acc, l) => acc + l.qtyOut, 0),
      averageBuyCost,
      lines: lines, // ascending chronological order (Oldest -> Newest)
    }
  }

  /**
   * Create Driver
   */
  static async createDriver(data: Parameters<DriverRepository['create']>[0], user: string): Promise<Driver> {
    const record = await driverRepo.create(data)
    await AuditService.log('drivers', record.id, 'CREATE', null, record, user)
    return record
  }

  /**
   * Update Driver
   */
  static async updateDriver(id: string, data: Parameters<DriverRepository['update']>[1], user: string): Promise<Driver> {
    const prior = await driverRepo.getById(id)
    const updated = await driverRepo.update(id, data)
    await AuditService.log('drivers', id, 'UPDATE', prior, updated, user)
    return updated
  }

  /**
   * Soft Delete Driver
   */
  static async deleteDriver(id: string, user: string): Promise<boolean> {
    const prior = await driverRepo.getById(id)
    await driverRepo.delete(id)
    await AuditService.log('drivers', id, 'DELETE', prior, { ...prior, deletedAt: new Date().toISOString() }, user)
    return true
  }

  static async list(): Promise<Driver[]> {
    return driverRepo.list()
  }

  static async getById(id: string): Promise<Driver | null> {
    return driverRepo.getById(id)
  }

  static async calculateDriverBalance(driverId: string, upToDate?: string): Promise<number> {
    return InventoryService.calculateInventory(driverId, upToDate)
  }
}
