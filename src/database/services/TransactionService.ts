import { db, runInTransaction } from '../db'
import { transactions, inventory as inventoryTable, auditLogs } from '../schema/schema'
import { TransactionRepository } from '../repositories/TransactionRepository'
import { DriverRepository } from '../repositories/DriverRepository'
import { CustomerRepository } from '../repositories/CustomerRepository'
import { SupplierRepository } from '../repositories/SupplierRepository'
import { InventoryService } from './InventoryService'
import { SettingsService } from './SettingsService'
import { generateNextTransactionNumber } from '../utils/numbering'
import {
  validatePurchaseSchema,
  validateSaleSchema,
  validateTransferSchema,
} from '../schema/validation'
import {
  ValidationError,
  InsufficientInventoryError,
  InvalidTransferError,
  DriverNotFoundError,
  CustomerNotFoundError,
  SupplierNotFoundError,
} from '../errors'
import { eq, and, or, isNull, desc, sql } from 'drizzle-orm'
import crypto from 'crypto'

const txRepo = new TransactionRepository()
const driverRepo = new DriverRepository()
const customerRepo = new CustomerRepository()
const supplierRepo = new SupplierRepository()

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface AffectedTransaction {
  txId: string
  txNumber: string
  txType: string
  txDate: string
  quantity: number
  stockAfter: number
}

export interface StockConflict {
  editedTxId: string
  editedTxNumber: string
  editedTxType: string
  driverLocationId: string
  driverName?: string
  shortage: number          // always negative
  requiredStock: number     // Math.abs(shortage)
  affectedTransactions: AffectedTransaction[]
  description: string
  suggestedFixes: string[]
}

export type EditDeleteResult<T> =
  | { success: true; data: T }
  | { success: false; conflicts: StockConflict[] }

// ─── Internal Running State ──────────────────────────────────────────────────

interface LocationState {
  stock: number
  wac: number
  cumulative_volume: number
  cumulative_value: number
}

export class TransactionService {
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
    // 1. Validate business parameters
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

    // Run inside database transaction block for atomicity
    return runInTransaction(async () => {
      // Fetch sequential number
      const txNumber = await generateNextTransactionNumber('PURCHASE', db)

      // Calculate pre-WAC and post-WAC
      const currentStock = await InventoryService.calculateInventory(data.destinationLocation)
      const currentWac = await InventoryService.calculateWeightedAverageCost(data.destinationLocation)

      const newStock = currentStock + data.quantity
      const newWac = newStock > 0
        ? Math.round((currentStock * currentWac + data.quantity * data.unitCost) / newStock)
        : data.unitCost

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
        averageCostSnapshot: newWac,
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

      // Rebuild snapshot for destination location
      await InventoryService.rebuildSnapshot(data.destinationLocation)

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
      // Validate sufficient stock
      const srcStock = await InventoryService.calculateInventory(data.fromDriverId)
      if (srcStock < data.quantity) {
        const config = await SettingsService.getSettings()
        const unit = config.quantity_abbreviation || 'Gal'
        throw new InsufficientInventoryError(
          `Driver ${fromDriver.name}`,
          data.quantity,
          srcStock,
          unit
        )
      }

      // Fetch sequential number
      const txNumber = await generateNextTransactionNumber('TRANSFER', db)

      // Cost carrier: WAC of source location
      const sourceWac = await InventoryService.calculateWeightedAverageCost(data.fromDriverId)

      const businessData = {
        sourceType: 'DRIVER' as const,
        sourceId: data.fromDriverId,
        destinationType: 'DRIVER' as const,
        destinationId: data.toDriverId,
        quantity: data.quantity,
        unitCost: sourceWac,
        sellingRate: 0,
      }

      const valid = validateTransferSchema.safeParse(businessData)
      if (!valid.success) {
        throw new ValidationError('Transfer validation failed', valid.error.flatten().fieldErrors)
      }

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
        unitCost: sourceWac,
        sellingRate: 0,
        averageCostSnapshot: sourceWac,
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

      // Rebuild snapshots for both source and destination drivers to keep them perfectly in sync
      await InventoryService.rebuildSnapshot(data.fromDriverId)
      await InventoryService.rebuildSnapshot(data.toDriverId)

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
      // Validate sufficient stock
      const currentStock = await InventoryService.calculateInventory(data.driverId)
      if (currentStock < data.quantity) {
        const config = await SettingsService.getSettings()
        const unit = config.quantity_abbreviation || 'Gal'
        throw new InsufficientInventoryError(
          `Driver ${driver.name}`,
          data.quantity,
          currentStock,
          unit
        )
      }

      // Fetch sequential number
      const txNumber = await generateNextTransactionNumber('SALE', db)

      // WAC of driver at time of sale
      const sourceWac = await InventoryService.calculateWeightedAverageCost(data.driverId)

      const businessData = {
        sourceType: 'DRIVER' as const,
        sourceId: data.driverId,
        destinationType: 'CUSTOMER' as const,
        destinationId: data.customerId,
        quantity: data.quantity,
        unitCost: sourceWac,
        sellingRate: data.sellingRate,
      }

      const valid = validateSaleSchema.safeParse(businessData)
      if (!valid.success) {
        throw new ValidationError('Sale validation failed', valid.error.flatten().fieldErrors)
      }

      // Calculate profit: revenue minus cost
      const profit = Math.round(data.quantity * (data.sellingRate - sourceWac))

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
        unitCost: sourceWac,
        sellingRate: data.sellingRate,
        averageCostSnapshot: sourceWac,
        profitSnapshot: profit,
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

      // Rebuild snapshot for driver location
      await InventoryService.rebuildSnapshot(data.driverId)

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
   * Execute Return: Customer Return, Supplier Return, or Driver Return
   */
  static async createReturn(
    data: {
      returnType: 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN'
      sourceId: string // E.g., customerId, or driverId
      destinationId: string // E.g., driverId, or supplierId
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
        // SUPPLIER_RETURN
        sourceType = 'DRIVER'
        destinationType = 'SUPPLIER'

        // Check source stock availability
        const stock = await InventoryService.calculateInventory(data.sourceId)
        if (stock < data.quantity) {
          const config = await SettingsService.getSettings()
          const unit = config.quantity_abbreviation || 'Gal'
          throw new InsufficientInventoryError(data.sourceId, data.quantity, stock, unit)
        }
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
        sellingRate: data.returnType === 'CUSTOMER_RETURN' ? data.costOrRate : 0, // rate refunded
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

      // Rebuild affected location snapshots
      if (sourceType === 'DRIVER') {
        const srcStock = await InventoryService.calculateInventory(data.sourceId)
        const srcWac = await InventoryService.calculateWeightedAverageCost(data.sourceId)
        await db
          .insert(inventoryTable)
          .values({
            item: data.sourceId,
            currentStock: srcStock,
            weightedAverageCost: srcWac,
            lastTransactionId: txId,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: inventoryTable.item,
            set: {
              currentStock: srcStock,
              weightedAverageCost: srcWac,
              lastTransactionId: txId,
              updatedAt: now,
            },
          })
      }

      if (destinationType === 'DRIVER') {
        const destStock = await InventoryService.calculateInventory(data.destinationId)
        const destWac = await InventoryService.calculateWeightedAverageCost(data.destinationId)
        await db
          .insert(inventoryTable)
          .values({
            item: data.destinationId,
            currentStock: destStock,
            weightedAverageCost: destWac,
            lastTransactionId: txId,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: inventoryTable.item,
            set: {
              currentStock: destStock,
              weightedAverageCost: destWac,
              lastTransactionId: txId,
              updatedAt: now,
            },
          })
      }

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

        // Check sufficient stock for decrease adjustments
        const stock = await InventoryService.calculateInventory(data.locationId)
        if (stock < data.quantity) {
          const config = await SettingsService.getSettings()
          const unit = config.quantity_abbreviation || 'Gal'
          throw new InsufficientInventoryError(data.locationId, data.quantity, stock, unit)
        }
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

      // Update inventory snapshot cache
      const finalStock = await InventoryService.calculateInventory(data.locationId)
      const finalWac = await InventoryService.calculateWeightedAverageCost(data.locationId)
      await db
        .insert(inventoryTable)
        .values({
          item: data.locationId,
          currentStock: finalStock,
          weightedAverageCost: finalWac,
          lastTransactionId: txId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: {
            currentStock: finalStock,
            weightedAverageCost: finalWac,
            lastTransactionId: txId,
            updatedAt: now,
          },
        })

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

      // Recalculate WAC and update snapshot cache
      const finalStock = await InventoryService.calculateInventory(data.locationId)
      const finalWac = await InventoryService.calculateWeightedAverageCost(data.locationId)

      await db
        .insert(inventoryTable)
        .values({
          item: data.locationId,
          currentStock: finalStock,
          weightedAverageCost: finalWac,
          lastTransactionId: txId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: {
            currentStock: finalStock,
            weightedAverageCost: finalWac,
            lastTransactionId: txId,
            updatedAt: now,
          },
        })

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
   * Soft-delete a transaction with two-stage inventory validation.
   * Returns EditDeleteResult — caller must check result.success before proceeding.
   * overrideValidation: true skips the workflow "must be latest of type" guard only;
   * the two-stage accounting check always runs.
   */
  static async deleteTransaction(
    id: string,
    user: string,
    overrideValidation = false
  ): Promise<EditDeleteResult<boolean>> {
    const prior = await txRepo.getById(id)
    if (!prior) throw new Error(`Transaction not found: ${id}`)

    const editedTxMeta = {
      id,
      number: prior.transactionNumber || id,
      type: 'DELETE',
    }

    // Workflow guard (skippable) — block if later same-type transactions exist
    if (!overrideValidation) {
      const laterSameType = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.transactionType, prior.transactionType),
            isNull(transactions.deletedAt),
            or(
              sql`${transactions.transactionDate} > ${prior.transactionDate}`,
              and(
                eq(transactions.transactionDate, prior.transactionDate),
                sql`${transactions.createdAt} > ${prior.createdAt}`
              )
            )
          )
        )
        .limit(1)

      if (laterSameType.length > 0) {
        // Run two-stage check — recalculation may still resolve the conflict
        const conflicts = await this.runTwoStageValidation({ [id]: null }, editedTxMeta)
        if (conflicts.length > 0) return { success: false, conflicts }
        // If resolved by recalculation, fall through and commit
      }
    }

    // Accounting math check — always runs regardless of overrideValidation
    const conflicts = await this.runTwoStageValidation({ [id]: null }, editedTxMeta)
    if (conflicts.length > 0) return { success: false, conflicts }

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

      return { success: true as const, data: true }
    })
  }

  /**
   * Rebuilds snapshots and removes deletedAt timestamp
   */
  static async restoreTransaction(id: string, user: string): Promise<boolean> {
    // Find soft deleted transaction
    const result = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
    
    const prior = result[0]
    if (!prior || !prior.deletedAt) throw new Error(`Transaction is not soft-deleted or does not exist: ${id}`)

    return runInTransaction(async () => {
      // Simulate restore before saving
      try {
        await this.simulateLedger({ [id]: { deletedAt: null } })
      } catch (err: any) {
        throw new ValidationError(err.message || 'Invalid restore: resulting stock would fall below zero')
      }

      const now = new Date().toISOString()

      // Reset deletedAt to null
      await db
        .update(transactions)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(transactions.id, id))

      // Trigger retroactive recomputations chronologically
      await this.recalculateLedgerInternal()

      // Log audit
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

      return true
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
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    
    return runInTransaction(async () => {
      const srcStock = await InventoryService.calculateInventory(data.sourceLocation)
      if (srcStock < data.quantity) {
        const config = await SettingsService.getSettings()
        const unit = config.quantity_abbreviation || 'Gal'
        throw new InsufficientInventoryError(data.sourceLocation, data.quantity, srcStock, unit)
      }

      const txNumber = await generateNextTransactionNumber('TRANSFER', db)
      const sourceWac = await InventoryService.calculateWeightedAverageCost(data.sourceLocation)

      const txId = crypto.randomUUID()
      const now = new Date().toISOString()

      const ledgerRecord = {
        id: txId,
        transactionNumber: txNumber,
        transactionType: 'TRANSFER',
        sourceType: data.sourceType,
        sourceId: data.sourceLocation,
        destinationType: data.destinationType,
        destinationId: data.destinationLocation,
        quantity: data.quantity,
        unitCost: sourceWac,
        sellingRate: 0,
        averageCostSnapshot: sourceWac,
        profitSnapshot: 0,
        referenceNumber: null,
        referenceType: null,
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)

      // Rebuild and update snapshots
      const newSrcStock = Math.max(0, srcStock - data.quantity)
      await db
        .insert(inventoryTable)
        .values({
          item: data.sourceLocation,
          currentStock: newSrcStock,
          weightedAverageCost: sourceWac,
          lastTransactionId: txId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: {
            currentStock: newSrcStock,
            lastTransactionId: txId,
            updatedAt: now,
          },
        })

      const destStock = await InventoryService.calculateInventory(data.destinationLocation)
      const newDestStock = destStock + data.quantity
      const destWacAtTime = await InventoryService.calculateWeightedAverageCost(data.destinationLocation)
      const newDestWac = newDestStock > 0
        ? Math.round((destStock * destWacAtTime + data.quantity * sourceWac) / newDestStock)
        : sourceWac

      await db
        .insert(inventoryTable)
        .values({
          item: data.destinationLocation,
          currentStock: newDestStock,
          weightedAverageCost: newDestWac,
          lastTransactionId: txId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: {
            currentStock: newDestStock,
            weightedAverageCost: newDestWac,
            lastTransactionId: txId,
            updatedAt: now,
          },
        })

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

  // ─── Core Ledger Engine ────────────────────────────────────────────────────

  /**
   * Single WAC algorithm used by both validation (strict mode) and
   * recalculation (rebuild mode).
   *
   * strict  — tracks exact stock levels (can go negative), accumulates conflicts
   * rebuild — clips stock at Math.max(0, ...) and returns final state for DB writes
   */
  private static runLedgerPass(
    sortedTxs: any[],
    mode: 'strict' | 'rebuild',
    _editedTxMeta?: { id: string; number: string; type: string }
  ): {
    state: Record<string, LocationState>
    conflicts: Map<string, { shortage: number; affected: AffectedTransaction[] }>
  } {
    const state: Record<string, LocationState> = {}
    // conflicts keyed by driverLocationId
    const conflicts = new Map<string, { shortage: number; affected: AffectedTransaction[] }>()

    const getState = (locationId: string): LocationState => {
      if (!state[locationId]) {
        state[locationId] = { stock: 0, wac: 0, cumulative_volume: 0, cumulative_value: 0 }
      }
      return state[locationId]
    }

    const recordConflict = (
      locationId: string,
      stockAfter: number,
      tx: any
    ) => {
      const existing = conflicts.get(locationId)
      const affEntry: AffectedTransaction = {
        txId: tx.id,
        txNumber: tx.transactionNumber || tx.id,
        txType: tx.transactionType,
        txDate: tx.transactionDate,
        quantity: tx.quantity,
        stockAfter,
      }
      if (existing) {
        if (stockAfter < existing.shortage) existing.shortage = stockAfter
        existing.affected.push(affEntry)
      } else {
        conflicts.set(locationId, { shortage: stockAfter, affected: [affEntry] })
      }
    }

    for (const tx of sortedTxs) {
      const { transactionType, sourceType, sourceId, destinationType, destinationId, quantity } = tx
      let unitCost = tx.unitCost

      if (transactionType === 'PURCHASE' || transactionType === 'OPENING_BALANCE') {
        const dest = getState(destinationId)
        const newWac = (dest.cumulative_volume + quantity) > 0
          ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
          : unitCost
        dest.cumulative_volume += quantity
        dest.cumulative_value += quantity * unitCost
        dest.wac = newWac
        dest.stock += quantity

      } else if (transactionType === 'TRANSFER') {
        const src = getState(sourceId)
        const dest = getState(destinationId)
        unitCost = src.wac
        const newSrcStock = src.stock - quantity
        if (mode === 'strict' && newSrcStock < 0) {
          recordConflict(sourceId, newSrcStock, tx)
          src.stock = newSrcStock  // keep going to find all conflicts
        } else {
          src.stock = mode === 'rebuild' ? Math.max(0, newSrcStock) : newSrcStock
        }
        const newDestWac = (dest.cumulative_volume + quantity) > 0
          ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
          : unitCost
        dest.cumulative_volume += quantity
        dest.cumulative_value += quantity * unitCost
        dest.wac = newDestWac
        dest.stock += quantity

      } else if (transactionType === 'SALE') {
        const src = getState(sourceId)
        const newSrcStock = src.stock - quantity
        if (mode === 'strict' && newSrcStock < 0) {
          recordConflict(sourceId, newSrcStock, tx)
          src.stock = newSrcStock
        } else {
          src.stock = mode === 'rebuild' ? Math.max(0, newSrcStock) : newSrcStock
        }

      } else if (transactionType === 'RETURN') {
        if (sourceId !== 'NONE' && sourceType === 'DRIVER') {
          const src = getState(sourceId)
          const newSrcStock = src.stock - quantity
          if (mode === 'strict' && newSrcStock < 0) {
            recordConflict(sourceId, newSrcStock, tx)
            src.stock = newSrcStock
          } else {
            src.stock = mode === 'rebuild' ? Math.max(0, newSrcStock) : newSrcStock
          }
        }
        if (destinationId !== 'NONE' && destinationType === 'DRIVER') {
          const dest = getState(destinationId)
          const newWac = (dest.cumulative_volume + quantity) > 0
            ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
            : unitCost
          dest.cumulative_volume += quantity
          dest.cumulative_value += quantity * unitCost
          dest.wac = newWac
          dest.stock += quantity
        }

      } else if (transactionType === 'ADJUSTMENT') {
        if (sourceId !== 'NONE') {
          const src = getState(sourceId)
          unitCost = src.wac
          const newSrcStock = src.stock - quantity
          if (mode === 'strict' && newSrcStock < 0) {
            recordConflict(sourceId, newSrcStock, tx)
            src.stock = newSrcStock
          } else {
            src.stock = mode === 'rebuild' ? Math.max(0, newSrcStock) : newSrcStock
          }
        } else if (destinationId !== 'NONE') {
          const dest = getState(destinationId)
          unitCost = dest.wac
          const newWac = (dest.cumulative_volume + quantity) > 0
            ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
            : unitCost
          dest.cumulative_volume += quantity
          dest.cumulative_value += quantity * unitCost
          dest.wac = newWac
          dest.stock += quantity
        }
      }
    }

    return { state, conflicts }
  }

  /**
   * Stage 2 validation: apply overrides in-memory, run the ledger engine in strict mode,
   * and return a fully-populated StockConflict[] (may contain multiple drivers).
   * Returns empty array if the change is valid after recalculation.
   */
  private static async validateLedgerConflicts(
    overrides: Record<string, any | null>,
    editedTxMeta: { id: string; number: string; type: string }
  ): Promise<StockConflict[]> {
    // 1. Fetch all active transactions
    const activeTxs = await db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))

    // 2. For restore simulations, also include soft-deleted records that appear in overrides
    const simulatedTxs: any[] = [...activeTxs]
    for (const key of Object.keys(overrides)) {
      const overrideVal = overrides[key]
      const inActive = activeTxs.some((t) => t.id === key)
      if (overrideVal !== null && !inActive) {
        const deletedTx = await db
          .select()
          .from(transactions)
          .where(eq(transactions.id, key))
          .limit(1)
        if (deletedTx[0]) simulatedTxs.push({ ...deletedTx[0], ...overrideVal })
      }
    }

    // 3. Apply overrides (null = delete, object = merge)
    const finalTxs: any[] = []
    for (const tx of simulatedTxs) {
      if (tx.id in overrides) {
        const override = overrides[tx.id]
        if (override === null) continue  // simulated deletion
        finalTxs.push({ ...tx, ...override })
      } else {
        finalTxs.push(tx)
      }
    }

    // 4. Sort chronologically (same order as recalculateLedgerInternal)
    const typePriority: Record<string, number> = {
      OPENING_BALANCE: 1, PURCHASE: 1, TRANSFER: 2, RETURN: 2, SALE: 3, ADJUSTMENT: 3,
    }
    finalTxs.sort((a, b) => {
      if (a.transactionDate !== b.transactionDate)
        return a.transactionDate.localeCompare(b.transactionDate)
      const pA = typePriority[a.transactionType] || 99
      const pB = typePriority[b.transactionType] || 99
      if (pA !== pB) return pA - pB
      return a.createdAt.localeCompare(b.createdAt)
    })

    // 5. Run strict engine
    const { conflicts } = this.runLedgerPass(finalTxs, 'strict', editedTxMeta)
    if (conflicts.size === 0) return []

    // 6. Enrich each conflict with driver name and suggested fixes
    const result: StockConflict[] = []
    for (const [locationId, { shortage, affected }] of conflicts.entries()) {
      let driverName: string | undefined
      try {
        const driver = await driverRepo.getById(locationId)
        driverName = driver?.name
      } catch { /* ignore */ }

      const firstAff = affected[0]

      const description =
        `${editedTxMeta.type === 'DELETE' ? 'Deleting' : 'Editing'} ` +
        `${editedTxMeta.type} ${editedTxMeta.number} would cause ` +
        `${driverName || locationId} to have ${shortage.toFixed(0)} L ` +
        `before ${firstAff?.txNumber} on ${firstAff?.txDate}` +
        (affected.length > 1 ? `. Also affects: ${affected.slice(1).map((a) => a.txNumber).join(', ')}` : '.')

      const requiredStock = Math.abs(shortage)
      const suggestedFixes: string[] = [
        `Reduce the edited quantity to free up at least ${requiredStock.toFixed(0)} L`,
        ...affected.slice(0, 3).map(
          (a) => `Delete or reduce ${a.txNumber} (${a.txType}, ${a.quantity} L) before retrying`
        ),
        `Add a new Purchase of ≥${requiredStock.toFixed(0)} L before ${firstAff?.txDate}`,
      ]

      result.push({
        editedTxId: editedTxMeta.id,
        editedTxNumber: editedTxMeta.number,
        editedTxType: editedTxMeta.type,
        driverLocationId: locationId,
        driverName,
        shortage,
        requiredStock,
        affectedTransactions: affected,
        description,
        suggestedFixes,
      })
    }
    return result
  }

  // ─── Two-Stage Validation Orchestrator ───────────────────────────────────────

  /**
   * Runs Stage 1 (simulateLedger throw-based quick check), and only if Stage 1 fails,
   * runs Stage 2 (validateLedgerConflicts full simulation with recalculation).
   * Returns empty array if the operation is valid. Returns StockConflict[] if blocked.
   */
  private static async runTwoStageValidation(
    overrides: Record<string, any | null>,
    editedTxMeta: { id: string; number: string; type: string }
  ): Promise<StockConflict[]> {
    // Stage 1 — quick throw-based check (untouched simulateLedger)
    try {
      await this.simulateLedger(overrides)
      return []  // Stage 1 passed — no need for Stage 2
    } catch {
      // Stage 1 found a potential conflict — run full simulation
    }

    // Stage 2 — full in-memory recalculation using runLedgerPass
    return this.validateLedgerConflicts(overrides, editedTxMeta)
  }

  /**
   * Simulates running the entire chronological ledger to check if any edits or deletions
   * would result in negative stock levels at any point in the timeline.
   * overrides contains { [txId]: null (for deletion) } or { [txId]: Partial<Transaction> (for edit/restore) }
   */
  static async simulateLedger(
    overrides: Record<string, any | null>
  ): Promise<void> {
    const activeTxs = await db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))

    const simulatedTxs: any[] = [...activeTxs]

    // Handle soft-deleted transactions being simulated for a restore/edit
    for (const key of Object.keys(overrides)) {
      const overrideVal = overrides[key]
      const inActive = activeTxs.some((t) => t.id === key)
      
      // If we are simulating restoring/modifying a soft-deleted transaction (override is not null)
      if (overrideVal !== null && !inActive) {
        const deletedTx = await db
          .select()
          .from(transactions)
          .where(eq(transactions.id, key))
          .limit(1)
        if (deletedTx[0]) {
          simulatedTxs.push({ ...deletedTx[0], ...overrideVal })
        }
      }
    }

    // Filter out simulated deletions & apply edits
    const finalSimulatedTxs: any[] = []
    for (const tx of simulatedTxs) {
      if (tx.id in overrides) {
        const override = overrides[tx.id]
        if (override === null) {
          // Deletion simulation - skip this transaction
          continue
        } else {
          // Edit simulation - merge override fields
          finalSimulatedTxs.push({ ...tx, ...override })
        }
      } else {
        finalSimulatedTxs.push(tx)
      }
    }

    const typePriority: Record<string, number> = {
      'OPENING_BALANCE': 1,
      'PURCHASE': 1,
      'TRANSFER': 2,
      'RETURN': 2,
      'SALE': 3,
      'ADJUSTMENT': 3,
    }

    finalSimulatedTxs.sort((a, b) => {
      if (a.transactionDate !== b.transactionDate) {
        return a.transactionDate.localeCompare(b.transactionDate)
      }
      const pA = typePriority[a.transactionType] || 99
      const pB = typePriority[b.transactionType] || 99
      if (pA !== pB) {
        return pA - pB
      }
      return a.createdAt.localeCompare(b.createdAt)
    })

    const runningStock: Record<string, number> = {}

    for (const tx of finalSimulatedTxs) {
      const { transactionType, sourceId, destinationId, quantity } = tx

      if (transactionType === 'PURCHASE' || transactionType === 'OPENING_BALANCE') {
        runningStock[destinationId] = (runningStock[destinationId] || 0) + quantity
      } 
      else if (transactionType === 'TRANSFER') {
        const srcStock = (runningStock[sourceId] || 0) - quantity
        if (srcStock < 0) {
          throw new ValidationError(
            `This transaction affects later inventory movements. Resulting stock for driver/location would fall below zero (${srcStock}).`
          )
        }
        runningStock[sourceId] = srcStock
        runningStock[destinationId] = (runningStock[destinationId] || 0) + quantity
      } 
      else if (transactionType === 'SALE') {
        const srcStock = (runningStock[sourceId] || 0) - quantity
        if (srcStock < 0) {
          throw new ValidationError(
            `This transaction affects later inventory movements. Resulting stock for driver/location would fall below zero (${srcStock}).`
          )
        }
        runningStock[sourceId] = srcStock
      }
      else if (transactionType === 'RETURN') {
        if (tx.sourceType === 'DRIVER') {
          const srcStock = (runningStock[sourceId] || 0) - quantity
          if (srcStock < 0) {
            throw new ValidationError(
              `This transaction affects later inventory movements. Resulting stock for driver/location would fall below zero (${srcStock}).`
            )
          }
          runningStock[sourceId] = srcStock
        }
        if (tx.destinationType === 'DRIVER') {
          runningStock[destinationId] = (runningStock[destinationId] || 0) + quantity
        }
      }
      else if (transactionType === 'ADJUSTMENT') {
        if (sourceId !== 'NONE') {
          const srcStock = (runningStock[sourceId] || 0) - quantity
          if (srcStock < 0) {
            throw new ValidationError(
              `This transaction affects later inventory movements. Resulting stock for driver/location would fall below zero (${srcStock}).`
            )
          }
          runningStock[sourceId] = srcStock
        } else if (destinationId !== 'NONE') {
          runningStock[destinationId] = (runningStock[destinationId] || 0) + quantity
        }
      }
    }
  }

  /**
   * Retroactively recalculate WAC snapshots and profits for all active transactions chronologically.
   * Delegates core accounting to runLedgerPass (rebuild mode) then writes results to DB.
   * Internal — must be called inside runInTransaction or normal context.
   */
  static async recalculateLedgerInternal(): Promise<void> {
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

    // 2. Run core engine in rebuild mode (clips at 0, computes WAC)
    const { state: runningState } = this.runLedgerPass(activeTxs, 'rebuild')

    // 3. Write WAC/profit snapshots back to each transaction record
    //    Re-run in rebuild mode tracking snapshots per tx for DB writes
    const snapState: Record<string, LocationState> = {}
    const getSnap = (locationId: string): LocationState => {
      if (!snapState[locationId])
        snapState[locationId] = { stock: 0, wac: 0, cumulative_volume: 0, cumulative_value: 0 }
      return snapState[locationId]
    }

    for (const tx of activeTxs) {
      const { id, transactionType, sourceType, sourceId, destinationType, destinationId, quantity } = tx
      let unitCost = tx.unitCost
      let averageCostSnapshot = tx.averageCostSnapshot
      let profitSnapshot = tx.profitSnapshot

      if (transactionType === 'PURCHASE' || transactionType === 'OPENING_BALANCE') {
        const dest = getSnap(destinationId)
        const newWac = (dest.cumulative_volume + quantity) > 0
          ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
          : unitCost
        dest.cumulative_volume += quantity
        dest.cumulative_value += quantity * unitCost
        dest.wac = newWac
        dest.stock += quantity
        averageCostSnapshot = dest.wac
      } else if (transactionType === 'TRANSFER') {
        const src = getSnap(sourceId)
        const dest = getSnap(destinationId)
        unitCost = src.wac
        averageCostSnapshot = src.wac
        src.stock = Math.max(0, src.stock - quantity)
        const newDestWac = (dest.cumulative_volume + quantity) > 0
          ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
          : unitCost
        dest.cumulative_volume += quantity
        dest.cumulative_value += quantity * unitCost
        dest.wac = newDestWac
        dest.stock += quantity
      } else if (transactionType === 'SALE') {
        const src = getSnap(sourceId)
        averageCostSnapshot = src.wac
        profitSnapshot = Math.round(quantity * (tx.sellingRate - averageCostSnapshot))
        src.stock = Math.max(0, src.stock - quantity)
      } else if (transactionType === 'RETURN') {
        if (sourceId !== 'NONE' && sourceType === 'DRIVER') {
          const src = getSnap(sourceId)
          src.stock = Math.max(0, src.stock - quantity)
        }
        if (destinationId !== 'NONE' && destinationType === 'DRIVER') {
          const dest = getSnap(destinationId)
          const newWac = (dest.cumulative_volume + quantity) > 0
            ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
            : unitCost
          dest.cumulative_volume += quantity
          dest.cumulative_value += quantity * unitCost
          dest.wac = newWac
          dest.stock += quantity
          averageCostSnapshot = dest.wac
        }
      } else if (transactionType === 'ADJUSTMENT') {
        if (sourceId !== 'NONE') {
          const src = getSnap(sourceId)
          unitCost = src.wac
          averageCostSnapshot = src.wac
          src.stock = Math.max(0, src.stock - quantity)
        } else if (destinationId !== 'NONE') {
          const dest = getSnap(destinationId)
          unitCost = dest.wac
          averageCostSnapshot = dest.wac
          const newWac = (dest.cumulative_volume + quantity) > 0
            ? Math.round((dest.cumulative_value + quantity * unitCost) / (dest.cumulative_volume + quantity))
            : unitCost
          dest.cumulative_volume += quantity
          dest.cumulative_value += quantity * unitCost
          dest.wac = newWac
          dest.stock += quantity
        }
      }

      if (
        tx.unitCost !== unitCost ||
        tx.averageCostSnapshot !== averageCostSnapshot ||
        tx.profitSnapshot !== profitSnapshot
      ) {
        await db
          .update(transactions)
          .set({ unitCost, averageCostSnapshot, profitSnapshot })
          .where(eq(transactions.id, id))
      }
    }

    // 4. Update inventory cache snapshots for all affected locations
    const now = new Date().toISOString()
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
      await db
        .insert(inventoryTable)
        .values({ item, currentStock: st.stock, weightedAverageCost: st.wac, lastTransactionId: lastId, updatedAt: now })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: { currentStock: st.stock, weightedAverageCost: st.wac, lastTransactionId: lastId, updatedAt: now },
        })
    }
  }

  static async recalculateLedger(): Promise<void> {
    return runInTransaction(async () => {
      await this.recalculateLedgerInternal()
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
  ): Promise<EditDeleteResult<any>> {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    if (data.unitCost <= 0) throw new ValidationError('Unit cost must be greater than zero')
    if (!data.transactionDate) throw new ValidationError('Transaction date is required')

    const prior = await txRepo.getById(id)
    if (!prior) throw new Error(`Transaction not found: ${id}`)
    if (prior.transactionType !== 'PURCHASE') throw new Error(`Transaction ${id} is not a purchase`)

    const supplier = await supplierRepo.getById(data.supplierId)
    if (!supplier) throw new SupplierNotFoundError(data.supplierId)

    const editedTxMeta = { id, number: prior.transactionNumber || id, type: 'PURCHASE' }
    const overrides = {
      [id]: {
        sourceId: data.supplierId,
        destinationId: data.destinationLocation,
        quantity: data.quantity,
        unitCost: data.unitCost,
        transactionDate: data.transactionDate,
      }
    }

    // Two-stage accounting validation (always runs)
    const conflicts = await this.runTwoStageValidation(overrides, editedTxMeta)
    if (conflicts.length > 0) return { success: false as const, conflicts }

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

      return { success: true as const, data: ledgerRecord }
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
  ): Promise<EditDeleteResult<any>> {
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

    const editedTxMeta = { id, number: prior.transactionNumber || id, type: 'TRANSFER' }
    const overrides = {
      [id]: {
        sourceId: data.fromDriverId,
        destinationId: data.toDriverId,
        quantity: data.quantity,
        transactionDate: data.transactionDate,
      }
    }

    // Two-stage accounting validation (always runs)
    const conflicts = await this.runTwoStageValidation(overrides, editedTxMeta)
    if (conflicts.length > 0) return { success: false as const, conflicts }

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

      return { success: true as const, data: ledgerRecord }
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
  ): Promise<EditDeleteResult<any>> {
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

    const editedTxMeta = { id, number: prior.transactionNumber || id, type: 'SALE' }
    const overrides = {
      [id]: {
        sourceId: data.driverId,
        destinationId: data.customerId,
        quantity: data.quantity,
        sellingRate: data.sellingRate,
        transactionDate: data.transactionDate,
      }
    }

    // Two-stage accounting validation (always runs)
    const conflicts = await this.runTwoStageValidation(overrides, editedTxMeta)
    if (conflicts.length > 0) return { success: false as const, conflicts }

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

      return { success: true as const, data: ledgerRecord }
    })
  }

  static async list() {
    return txRepo.list()
  }

  static async getById(id: string) {
    return txRepo.getById(id)
  }
}
