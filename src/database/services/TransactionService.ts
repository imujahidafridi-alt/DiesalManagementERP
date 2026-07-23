import { db, runInTransaction, sqlite } from '../db'
import { transactions, inventory as inventoryTable, drivers as driversTable, auditLogs } from '../schema/schema'
import { TransactionRepository } from '../repositories/TransactionRepository'
import { DriverRepository } from '../repositories/DriverRepository'
import { CustomerRepository } from '../repositories/CustomerRepository'
import { SupplierRepository } from '../repositories/SupplierRepository'
import { InventoryService } from './InventoryService'
import { CostingEngine } from './CostingEngine'
import { SettingsService } from './SettingsService'
import { CloudVaultService } from './CloudVaultService'
import { generateNextTransactionNumber } from '../utils/numbering'
import { validatePurchaseSchema } from '../schema/validation'
import {
  ValidationError,
  DriverNotFoundError,
  CustomerNotFoundError,
  SupplierNotFoundError,
  InvalidTransferError,
} from '../errors'
import { eq, and, isNull, desc, sql, or } from 'drizzle-orm'
import crypto from 'crypto'

const txRepo = new TransactionRepository()
const driverRepo = new DriverRepository()
const customerRepo = new CustomerRepository()
const supplierRepo = new SupplierRepository()

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface TransactionOperationResult<T = any> {
  success: boolean
  data?: T
  warnings?: string[]
}

// ─── Internal Running State ──────────────────────────────────────────────────

interface LocationState {
  stock: number
  wac: number
  cumulative_volume: number
  cumulative_value: number
}

export class TransactionService {
  /**
   * Helper to fetch negative stock warning notices across drivers/locations.
   */
  private static async checkNegativeStockWarnings(): Promise<string[]> {
    try {
      const settings = await SettingsService.getSettings()
      const unit = settings.quantity_abbreviation || settings.fuel_unit || 'Gal'
      const negativeItems = await db
        .select({ item: inventoryTable.item, currentStock: inventoryTable.currentStock })
        .from(inventoryTable)
        .where(sql`${inventoryTable.currentStock} < 0`)

      const warnings: string[] = []
      for (const inv of negativeItems) {
        let name = inv.item
        try {
          const driver = await driverRepo.getById(inv.item)
          if (driver?.name) name = `Driver ${driver.name}`
        } catch { /* ignore */ }
        warnings.push(`${name} stock is now ${inv.currentStock.toFixed(0)} ${unit}.`)
      }
      return warnings
    } catch {
      return []
    }
  }

  /**
   * Execute Purchase: Supplier -> Inventory Tank
   */
  static async createPurchase(
    data: {
      supplierId: string
      destinationLocation: string // representing driverId
      quantity: number
      unitCost: number // in cents
      referenceNumber?: string
      transactionDate: string
      notes?: string
    },
    createdBy: string
  ) {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.unitCost <= 0) throw new ValidationError('Unit cost must be greater than zero')
    if (!data.transactionDate) throw new ValidationError('Transaction date is required')

    const supplier = await supplierRepo.getById(data.supplierId)
    if (!supplier) throw new SupplierNotFoundError(data.supplierId)

    const driver = await driverRepo.getById(data.destinationLocation)
    if (!driver) throw new DriverNotFoundError(data.destinationLocation)

    const businessData = {
      sourceType: 'SUPPLIER' as const,
      sourceId: data.supplierId,
      destinationType: 'DRIVER' as const,
      destinationId: data.destinationLocation,
      quantity: data.quantity,
      unitCost: data.unitCost,
      sellingRate: 0,
    }

    const valid = validatePurchaseSchema.safeParse(businessData)
    if (!valid.success) {
      throw new ValidationError('Purchase validation failed', valid.error.flatten().fieldErrors)
    }

    return runInTransaction(async () => {
      const txNumber = await generateNextTransactionNumber('PURCHASE', db)
      const txId = crypto.randomUUID()
      const now = new Date().toISOString()

      const ledgerRecord = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'PURCHASE',
        sourceType: 'SUPPLIER' as const,
        sourceId: data.supplierId,
        destinationType: 'DRIVER' as const,
        destinationId: data.destinationLocation,
        quantity: data.quantity,
        unitCost: data.unitCost,
        sellingRate: 0,
        averageCostSnapshot: data.unitCost,
        profitSnapshot: 0,
        referenceNumber: data.referenceNumber || null,
        referenceType: data.referenceNumber ? 'VEHICLE_NO' : null,
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)

      // Rebuild snapshots & running WAC chronologically
      await this.recalculateLedgerInternal()

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: txId,
        action: 'CREATE',
        previousData: null,
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: createdBy,
      })

      const updated = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1)
      return updated[0] || ledgerRecord
    })
  }

  /**
   * Execute Transfer: From Driver -> To Driver
   */
  static async createTransfer(
    data: {
      fromDriverId: string
      toDriverId: string
      quantity: number
      vehicleNumber?: string
      transactionDate: string
      notes?: string
    },
    createdBy: string
  ) {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.fromDriverId === data.toDriverId) {
      throw new InvalidTransferError('Cannot transfer fuel to the same driver')
    }

    const fromDriver = await driverRepo.getById(data.fromDriverId)
    if (!fromDriver) throw new DriverNotFoundError(data.fromDriverId)

    const toDriver = await driverRepo.getById(data.toDriverId)
    if (!toDriver) throw new DriverNotFoundError(data.toDriverId)

    return runInTransaction(async () => {
      const txNumber = await generateNextTransactionNumber('TRANSFER', db)
      const txId = crypto.randomUUID()
      const now = new Date().toISOString()

      const ledgerRecord = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'TRANSFER',
        sourceType: 'DRIVER' as const,
        sourceId: data.fromDriverId,
        destinationType: 'DRIVER' as const,
        destinationId: data.toDriverId,
        quantity: data.quantity,
        unitCost: 0,
        sellingRate: 0,
        averageCostSnapshot: 0,
        profitSnapshot: 0,
        referenceNumber: data.vehicleNumber || null,
        referenceType: data.vehicleNumber ? 'VEHICLE_NO' : null,
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)
      await this.recalculateLedgerInternal(data.transactionDate)

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: txId,
        action: 'CREATE',
        previousData: null,
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: createdBy,
      })

      const updated = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1)
      return updated[0] || ledgerRecord
    })
  }

  /**
   * Execute Sale: Driver -> Customer
   */
  static async createSale(
    data: {
      driverId: string
      customerId: string
      quantity: number
      sellingRate: number // in cents
      vehicleNumber?: string
      transactionDate: string
      notes?: string
    },
    createdBy: string
  ) {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.sellingRate <= 0) throw new ValidationError('Selling rate must be greater than zero')

    const driver = await driverRepo.getById(data.driverId)
    if (!driver) throw new DriverNotFoundError(data.driverId)
    if (driver.status !== 'ACTIVE') throw new ValidationError(`Driver ${driver.name} is not active`)

    const customer = await customerRepo.getById(data.customerId)
    if (!customer) throw new CustomerNotFoundError(data.customerId)

    return runInTransaction(async () => {
      const txNumber = await generateNextTransactionNumber('SALE', db)
      const txId = crypto.randomUUID()
      const now = new Date().toISOString()

      const ledgerRecord = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'SALE',
        sourceType: 'DRIVER' as const,
        sourceId: data.driverId,
        destinationType: 'CUSTOMER' as const,
        destinationId: data.customerId,
        quantity: data.quantity,
        unitCost: 0,
        sellingRate: data.sellingRate,
        averageCostSnapshot: 0,
        profitSnapshot: 0,
        referenceNumber: data.vehicleNumber || null,
        referenceType: data.vehicleNumber ? 'VEHICLE_NO' : null,
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)
      await this.recalculateLedgerInternal(data.transactionDate)

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: txId,
        action: 'CREATE',
        previousData: null,
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: createdBy,
      })

      const updated = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1)
      return updated[0] || ledgerRecord
    })
  }

  /**
   * Execute Return: Customer -> Driver OR Driver -> Supplier
   */
  static async createReturn(
    data: {
      returnType: 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN'
      sourceId: string
      destinationId: string
      quantity: number
      costOrRate: number // unit value carrying value in cents
      referenceNumber?: string
      transactionDate: string
      notes?: string
    },
    createdBy: string
  ) {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')

    return runInTransaction(async () => {
      let sourceType: 'CUSTOMER' | 'DRIVER'
      let destinationType: 'DRIVER' | 'SUPPLIER'
      let costSnapshot = data.costOrRate

      if (data.returnType === 'CUSTOMER_RETURN') {
        sourceType = 'CUSTOMER'
        destinationType = 'DRIVER'
      } else {
        sourceType = 'DRIVER'
        destinationType = 'SUPPLIER'
      }

      const txNumber = await generateNextTransactionNumber('RETURN', db)
      const txId = crypto.randomUUID()
      const now = new Date().toISOString()

      const ledgerRecord = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'RETURN',
        sourceType,
        sourceId: data.sourceId,
        destinationType,
        destinationId: data.destinationId,
        quantity: data.quantity,
        unitCost: costSnapshot,
        sellingRate: data.returnType === 'CUSTOMER_RETURN' ? data.costOrRate : 0,
        averageCostSnapshot: costSnapshot,
        profitSnapshot: 0,
        referenceNumber: data.referenceNumber || null,
        referenceType: data.referenceNumber ? 'RETURN_NOTE' : null,
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)
      await this.recalculateLedgerInternal()

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: txId,
        action: 'CREATE',
        previousData: null,
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: createdBy,
      })

      return ledgerRecord
    })
  }

  /**
   * Execute Inventory Adjustment (Increase or Decrease)
   */
  static async createAdjustment(
    data: {
      locationId: string // E.g., Driver UUID
      locationType: 'DRIVER'
      adjustmentType: 'INCREASE' | 'DECREASE'
      quantity: number
      notes: string // Mandatory reason
      transactionDate: string
    },
    createdBy: string
  ) {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (!data.notes || data.notes.trim() === '') {
      throw new ValidationError('Adjustment requires a mandatory notes reason')
    }

    return runInTransaction(async () => {
      let sourceType: 'NONE' | 'DRIVER'
      let sourceId: string
      let destinationType: 'NONE' | 'DRIVER'
      let destinationId: string

      const currentWac = await InventoryService.calculateWeightedAverageCost(data.locationId)

      if (data.adjustmentType === 'INCREASE') {
        sourceType = 'NONE'
        sourceId = 'NONE'
        destinationType = data.locationType
        destinationId = data.locationId
      } else {
        sourceType = data.locationType
        sourceId = data.locationId
        destinationType = 'NONE'
        destinationId = 'NONE'
      }

      const txNumber = await generateNextTransactionNumber('ADJUSTMENT', db)
      const txId = crypto.randomUUID()
      const now = new Date().toISOString()

      const ledgerRecord = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'ADJUSTMENT',
        sourceType,
        sourceId,
        destinationType,
        destinationId,
        quantity: data.quantity,
        unitCost: currentWac,
        sellingRate: 0,
        averageCostSnapshot: currentWac,
        profitSnapshot: 0,
        referenceNumber: 'ADJUSTMENT',
        referenceType: 'ADJUSTMENT',
        transactionDate: data.transactionDate,
        notes: data.notes,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)
      await this.recalculateLedgerInternal()

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: txId,
        action: 'CREATE',
        previousData: null,
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: createdBy,
      })

      return ledgerRecord
    })
  }

  /**
   * Execute Opening Balance
   */
  static async createOpeningBalance(
    data: {
      locationId: string
      locationType: 'DRIVER'
      quantity: number
      unitCost: number // in cents
      transactionDate: string
      notes?: string
    },
    createdBy: string
  ) {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.unitCost <= 0) throw new ValidationError('Unit cost must be greater than zero')

    return runInTransaction(async () => {
      const txNumber = await generateNextTransactionNumber('OPENING_BALANCE', db)
      const txId = crypto.randomUUID()
      const now = new Date().toISOString()

      const ledgerRecord = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'OPENING_BALANCE',
        sourceType: 'NONE' as const,
        sourceId: 'NONE',
        destinationType: data.locationType,
        destinationId: data.locationId,
        quantity: data.quantity,
        unitCost: data.unitCost,
        sellingRate: 0,
        averageCostSnapshot: data.unitCost,
        profitSnapshot: 0,
        referenceNumber: 'OPENING_BALANCE',
        referenceType: 'OPENING_BALANCE',
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)
      await this.recalculateLedgerInternal()

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: txId,
        action: 'CREATE',
        previousData: null,
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: createdBy,
      })

      return ledgerRecord
    })
  }

  /**
   * Soft-delete a transaction. Never blocks due to negative stock.
   */
  static async deleteTransaction(
    id: string,
    user: string,
    _overrideValidation = false
  ): Promise<TransactionOperationResult<boolean>> {
    const prior = await txRepo.getById(id)
    if (!prior) throw new Error(`Transaction not found: ${id}`)

    return runInTransaction(async () => {
      const now = new Date().toISOString()

      await db
        .update(transactions)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(transactions.id, id))

      await this.recalculateLedgerInternal()

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: id,
        action: 'DELETE',
        previousData: JSON.stringify(prior),
        newData: JSON.stringify({ ...prior, deletedAt: now }),
        timestamp: now,
        user,
      })

      const warnings = await this.checkNegativeStockWarnings()
      return { success: true, data: true, warnings }
    })
  }

  /**
   * Restores a soft-deleted transaction.
   */
  static async restoreTransaction(id: string, user: string): Promise<TransactionOperationResult<boolean>> {
    const result = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
    
    const prior = result[0]
    if (!prior || !prior.deletedAt) throw new Error(`Transaction is not soft-deleted or does not exist: ${id}`)

    return runInTransaction(async () => {
      const now = new Date().toISOString()

      await db
        .update(transactions)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(transactions.id, id))

      await this.recalculateLedgerInternal()

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: id,
        action: 'RESTORE',
        previousData: JSON.stringify(prior),
        newData: JSON.stringify({ ...prior, deletedAt: null }),
        timestamp: now,
        user,
      })

      const warnings = await this.checkNegativeStockWarnings()
      return { success: true, data: true, warnings }
    })
  }

  /**
   * Expose old method for testing loader transfers directly
   */
  static async executeTransfer(
    data: {
      sourceLocation: string
      sourceType: 'DRIVER'
      destinationLocation: string
      destinationType: 'DRIVER'
      quantity: number
      transactionDate: string
      notes?: string
    },
    createdBy: string
  ) {
    return this.createTransfer(
      {
        fromDriverId: data.sourceLocation,
        toDriverId: data.destinationLocation,
        quantity: data.quantity,
        transactionDate: data.transactionDate,
        notes: data.notes,
      },
      createdBy
    )
  }

  // ─── Core Ledger Engine ────────────────────────────────────────────────────

  /**
   * Retroactively recalculate WAC snapshots and profits for all active transactions chronologically.
   * Internal — must be called inside runInTransaction or normal context.
   */
  /**
   * Retroactively recalculate WAC snapshots and profits for active transactions chronologically.
   * Internal — must be called inside runInTransaction or normal context.
   */
  static async recalculateLedgerInternal(_fromDate?: string): Promise<void> {
    // 1. Fetch & sort active transactions
    const activeTxs = await db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(transactions.transactionDate, transactions.createdAt)

    const typePriority: Record<string, number> = {
      OPENING_BALANCE: 1, PURCHASE: 1, TRANSFER: 2, RETURN: 2, SALE: 3, ADJUSTMENT: 3,
    }
    activeTxs.sort((a, b) => {
      if (a.transactionDate !== b.transactionDate)
        return a.transactionDate.localeCompare(b.transactionDate)
      const pA = typePriority[a.transactionType] || 99
      const pB = typePriority[b.transactionType] || 99
      if (pA !== pB) return pA - pB
      return a.createdAt.localeCompare(b.createdAt)
    })

    // 2. Prepare SQLite compiled statement for updating snapshots
    const updateTxStmt = sqlite.prepare(
      'UPDATE transactions SET unit_cost = ?, average_cost_snapshot = ?, profit_snapshot = ? WHERE id = ?'
    )

    // Pre-initialize runningState with all existing inventory items and active drivers to 0 stock & 0 WAC
    const runningState: Record<string, LocationState> = {}

    const existingInventory = await db.select({ item: inventoryTable.item }).from(inventoryTable)
    for (const inv of existingInventory) {
      runningState[inv.item] = { stock: 0, wac: 0, cumulative_volume: 0, cumulative_value: 0 }
    }

    const activeDrivers = await db.select({ id: driversTable.id }).from(driversTable).where(isNull(driversTable.deletedAt))
    for (const d of activeDrivers) {
      if (!runningState[d.id]) {
        runningState[d.id] = { stock: 0, wac: 0, cumulative_volume: 0, cumulative_value: 0 }
      }
    }

    const getSnap = (locationId: string): LocationState => {
      if (!runningState[locationId])
        runningState[locationId] = { stock: 0, wac: 0, cumulative_volume: 0, cumulative_value: 0 }
      return runningState[locationId]
    }

    let yieldCount = 0
    for (const tx of activeTxs) {
      const { id, transactionType, sourceType, sourceId, destinationType, destinationId, quantity } = tx
      let unitCost = tx.unitCost
      let averageCostSnapshot = tx.averageCostSnapshot
      let profitSnapshot = tx.profitSnapshot

      if (transactionType === 'PURCHASE' || transactionType === 'OPENING_BALANCE') {
        const dest = getSnap(destinationId)
        dest.wac = CostingEngine.calculateNewWac(dest.stock, dest.wac, quantity, unitCost)
        dest.stock += quantity
        averageCostSnapshot = dest.wac
      } else if (transactionType === 'TRANSFER') {
        const src = getSnap(sourceId)
        const dest = getSnap(destinationId)
        unitCost = src.wac
        averageCostSnapshot = src.wac
        src.stock = src.stock - quantity // Allow negative stock to flow
        dest.wac = CostingEngine.calculateNewWac(dest.stock, dest.wac, quantity, unitCost)
        dest.stock += quantity
      } else if (transactionType === 'SALE') {
        const src = getSnap(sourceId)
        averageCostSnapshot = src.wac
        profitSnapshot = CostingEngine.calculateProfit(quantity, tx.sellingRate, averageCostSnapshot)
        src.stock = src.stock - quantity // Allow negative stock to flow
      } else if (transactionType === 'RETURN') {
        if (sourceId !== 'NONE' && sourceType === 'DRIVER') {
          const src = getSnap(sourceId)
          src.stock = src.stock - quantity
        }
        if (destinationId !== 'NONE' && destinationType === 'DRIVER') {
          const dest = getSnap(destinationId)
          dest.wac = CostingEngine.calculateNewWac(dest.stock, dest.wac, quantity, unitCost)
          dest.stock += quantity
          averageCostSnapshot = dest.wac
        }
      } else if (transactionType === 'ADJUSTMENT') {
        if (sourceId !== 'NONE') {
          const src = getSnap(sourceId)
          unitCost = src.wac
          averageCostSnapshot = src.wac
          src.stock = src.stock - quantity
        } else if (destinationId !== 'NONE') {
          const dest = getSnap(destinationId)
          unitCost = dest.wac
          averageCostSnapshot = dest.wac
          dest.wac = CostingEngine.calculateNewWac(dest.stock, dest.wac, quantity, unitCost)
          dest.stock += quantity
        }
      }

      if (
        tx.unitCost !== unitCost ||
        tx.averageCostSnapshot !== averageCostSnapshot ||
        tx.profitSnapshot !== profitSnapshot
      ) {
        updateTxStmt.run(unitCost, averageCostSnapshot, profitSnapshot, id)
      }

      yieldCount++
      if (yieldCount % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }

    // 3. Update inventory cache snapshots for all locations in runningState
    const now = new Date().toISOString()
    const upsertInvStmt = sqlite.prepare(`
      INSERT INTO inventory (item, current_stock, weighted_average_cost, last_transaction_id, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(item) DO UPDATE SET
        current_stock = excluded.current_stock,
        weighted_average_cost = excluded.weighted_average_cost,
        last_transaction_id = excluded.last_transaction_id,
        updated_at = excluded.updated_at
    `)

    for (const [item, st] of Object.entries(runningState)) {
      const lastTx = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            isNull(transactions.deletedAt),
            or(eq(transactions.sourceId, item), eq(transactions.destinationId, item))
          )
        )
        .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
        .limit(1)
      const lastId = lastTx[0]?.id || 'NONE'
      upsertInvStmt.run(item, st.stock, st.wac, lastId, now)
    }

    // Dispatch background Cloud Vault sync (non-blocking)
    CloudVaultService.syncSnapshot('auto').catch(() => {})
  }

  static async recalculateLedger(fromDate?: string): Promise<void> {
    return runInTransaction(async () => {
      await this.recalculateLedgerInternal(fromDate)
    })
  }

  /**
   * Update Purchase: alters fields of an existing purchase and triggers retroactive recomputation
   */
  static async updatePurchase(
    id: string,
    data: {
      supplierId: string
      destinationLocation: string
      quantity: number
      unitCost: number // in cents
      referenceNumber?: string
      transactionDate: string
      notes?: string
    },
    updatedBy: string,
    _overrideValidation = false
  ): Promise<TransactionOperationResult<any>> {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.unitCost <= 0) throw new ValidationError('Unit cost must be greater than zero')
    if (!data.transactionDate) throw new ValidationError('Transaction date is required')

    const prior = await txRepo.getById(id)
    if (!prior) throw new Error(`Transaction not found: ${id}`)
    if (prior.transactionType !== 'PURCHASE') throw new Error(`Transaction ${id} is not a purchase`)

    const supplier = await supplierRepo.getById(data.supplierId)
    if (!supplier) throw new SupplierNotFoundError(data.supplierId)

    return runInTransaction(async () => {
      const now = new Date().toISOString()

      await db
        .update(transactions)
        .set({
          sourceId: data.supplierId,
          destinationId: data.destinationLocation,
          quantity: data.quantity,
          unitCost: data.unitCost,
          referenceNumber: data.referenceNumber || null,
          transactionDate: data.transactionDate,
          notes: data.notes || null,
          updatedAt: now,
        })
        .where(eq(transactions.id, id))

      await this.recalculateLedgerInternal()

      const updated = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1)
      const ledgerRecord = updated[0]

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: id,
        action: 'UPDATE',
        previousData: JSON.stringify(prior),
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: updatedBy,
      })

      const warnings = await this.checkNegativeStockWarnings()
      return { success: true, data: ledgerRecord, warnings }
    })
  }

  /**
   * Update Transfer: modifies a driver-to-driver transfer and triggers retroactive WAC recomputation
   */
  static async updateTransfer(
    id: string,
    data: {
      fromDriverId: string
      toDriverId: string
      quantity: number
      vehicleNumber?: string
      transactionDate: string
      notes?: string
    },
    updatedBy: string,
    _overrideValidation = false
  ): Promise<TransactionOperationResult<any>> {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.fromDriverId === data.toDriverId) {
      throw new InvalidTransferError('Cannot transfer fuel to the same driver')
    }

    const fromDriver = await driverRepo.getById(data.fromDriverId)
    if (!fromDriver) throw new DriverNotFoundError(data.fromDriverId)

    const toDriver = await driverRepo.getById(data.toDriverId)
    if (!toDriver) throw new DriverNotFoundError(data.toDriverId)

    const prior = await txRepo.getById(id)
    if (!prior) throw new Error(`Transaction not found: ${id}`)
    if (prior.transactionType !== 'TRANSFER') throw new Error(`Transaction ${id} is not a transfer`)

    return runInTransaction(async () => {
      const now = new Date().toISOString()

      await db
        .update(transactions)
        .set({
          sourceId: data.fromDriverId,
          destinationId: data.toDriverId,
          quantity: data.quantity,
          referenceNumber: data.vehicleNumber || null,
          referenceType: data.vehicleNumber ? 'VEHICLE_NO' : null,
          transactionDate: data.transactionDate,
          notes: data.notes || null,
          updatedAt: now,
        })
        .where(eq(transactions.id, id))

      await this.recalculateLedgerInternal()

      const updated = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1)
      const ledgerRecord = updated[0]

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: id,
        action: 'UPDATE',
        previousData: JSON.stringify(prior),
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: updatedBy,
      })

      const warnings = await this.checkNegativeStockWarnings()
      return { success: true, data: ledgerRecord, warnings }
    })
  }

  /**
   * Update Sale: modifies an existing customer sale and triggers retroactive recomputation
   */
  static async updateSale(
    id: string,
    data: {
      driverId: string
      customerId: string
      quantity: number
      sellingRate: number // in cents
      vehicleNumber?: string
      transactionDate: string
      notes?: string
    },
    updatedBy: string,
    _overrideValidation = false
  ): Promise<TransactionOperationResult<any>> {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.sellingRate <= 0) throw new ValidationError('Selling rate must be greater than zero')

    const driver = await driverRepo.getById(data.driverId)
    if (!driver) throw new DriverNotFoundError(data.driverId)
    if (driver.status !== 'ACTIVE') throw new ValidationError(`Driver ${driver.name} is not active`)

    const customer = await customerRepo.getById(data.customerId)
    if (!customer) throw new CustomerNotFoundError(data.customerId)

    const prior = await txRepo.getById(id)
    if (!prior) throw new Error(`Transaction not found: ${id}`)
    if (prior.transactionType !== 'SALE') throw new Error(`Transaction ${id} is not a sale`)

    return runInTransaction(async () => {
      const now = new Date().toISOString()

      const sourceWac = await InventoryService.calculateWeightedAverageCost(data.driverId)
      const profit = Math.round(data.quantity * (data.sellingRate - sourceWac))

      await db
        .update(transactions)
        .set({
          sourceId: data.driverId,
          destinationId: data.customerId,
          quantity: data.quantity,
          unitCost: sourceWac,
          sellingRate: data.sellingRate,
          averageCostSnapshot: sourceWac,
          profitSnapshot: profit,
          referenceNumber: data.vehicleNumber || null,
          referenceType: data.vehicleNumber ? 'VEHICLE_NO' : null,
          transactionDate: data.transactionDate,
          notes: data.notes || null,
          updatedAt: now,
        })
        .where(eq(transactions.id, id))

      await this.recalculateLedgerInternal()

      const updated = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1)
      const ledgerRecord = updated[0]

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        entityName: 'transactions',
        entityId: id,
        action: 'UPDATE',
        previousData: JSON.stringify(prior),
        newData: JSON.stringify(ledgerRecord),
        timestamp: now,
        user: updatedBy,
      })

      const warnings = await this.checkNegativeStockWarnings()
      return { success: true, data: ledgerRecord, warnings }
    })
  }

  static async list() {
    return txRepo.list()
  }

  static async getById(id: string) {
    return txRepo.getById(id)
  }
}
