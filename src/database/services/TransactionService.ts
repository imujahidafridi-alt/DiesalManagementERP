import { db, runInTransaction } from '../db'
import { transactions, inventory as inventoryTable, auditLogs } from '../schema/schema'
import { TransactionRepository } from '../repositories/TransactionRepository'
import { DriverRepository } from '../repositories/DriverRepository'
import { CustomerRepository } from '../repositories/CustomerRepository'
import { SupplierRepository } from '../repositories/SupplierRepository'
import { InventoryService } from './InventoryService'
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
import { eq, and, or, isNull, desc } from 'drizzle-orm'
import crypto from 'crypto'

const txRepo = new TransactionRepository()
const driverRepo = new DriverRepository()
const customerRepo = new CustomerRepository()
const supplierRepo = new SupplierRepository()

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

      // Update snapshot cache
      await db
        .insert(inventoryTable)
        .values({
          item: data.destinationLocation,
          currentStock: newStock,
          weightedAverageCost: newWac,
          lastTransactionId: txId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: {
            currentStock: newStock,
            weightedAverageCost: newWac,
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
   * Execute Transfer: From Driver -> To Driver
   */
  static async createTransfer(
    data: {
      fromDriverId: string
      toDriverId: string
      quantity: number
      referenceNumber?: string
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
        throw new InsufficientInventoryError(
          `Driver ${fromDriver.name}`,
          data.quantity,
          srcStock
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
        referenceNumber: data.referenceNumber || null,
        referenceType: data.referenceNumber ? 'GATE_PASS' : null,
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)

      // Update source inventory snapshot
      const newSrcStock = Math.max(0, srcStock - data.quantity)
      await db
        .insert(inventoryTable)
        .values({
          item: data.fromDriverId,
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

      // Update destination inventory snapshot (WAC recalculation)
      const destStock = await InventoryService.calculateInventory(data.toDriverId)
      const newDestStock = destStock + data.quantity
      const newDestWac = newDestStock > 0
        ? Math.round((destStock * (await InventoryService.calculateWeightedAverageCost(data.toDriverId)) + data.quantity * sourceWac) / newDestStock)
        : sourceWac

      await db
        .insert(inventoryTable)
        .values({
          item: data.toDriverId,
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

  /**
   * Execute Sale: Driver -> Customer
   */
  static async createSale(
    data: {
      driverId: string
      customerId: string
      quantity: number
      sellingRate: number // in cents
      referenceNumber?: string
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
        throw new InsufficientInventoryError(
          `Driver ${driver.name}`,
          data.quantity,
          currentStock
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
        referenceNumber: data.referenceNumber || null,
        referenceType: data.referenceNumber ? 'DELIVERY_NOTE' : null,
        transactionDate: data.transactionDate,
        notes: data.notes || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.insert(transactions).values(ledgerRecord)

      // Update source inventory snapshot cache
      const newStock = Math.max(0, currentStock - data.quantity)
      await db
        .insert(inventoryTable)
        .values({
          item: data.driverId,
          currentStock: newStock,
          weightedAverageCost: sourceWac,
          lastTransactionId: txId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: {
            currentStock: newStock,
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
        if (stock < data.quantity) throw new InsufficientInventoryError(data.sourceId, data.quantity, stock)
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
        if (stock < data.quantity) throw new InsufficientInventoryError(data.locationId, data.quantity, stock)
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
   * Reversible Soft Delete: updates deletedAt and rebuilds affected snapshots
   */
  static async deleteTransaction(id: string, user: string): Promise<boolean> {
    const prior = await txRepo.getById(id)
    if (!prior) throw new Error(`Transaction not found: ${id}`)

    return runInTransaction(async () => {
      const now = new Date().toISOString()
      
      // Update deletedAt
      await db
        .update(transactions)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(transactions.id, id))

      // Trigger retroactive recomputations chronologically
      await this.recalculateLedgerInternal()

      // Log audit
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

      return true
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
      referenceNumber?: string
      transactionDate: string
      notes?: string
    },
    createdBy: string
  ) {
    if (data.quantity <= 0) throw new ValidationError('Quantity must be greater than zero')
    
    return runInTransaction(async () => {
      const srcStock = await InventoryService.calculateInventory(data.sourceLocation)
      if (srcStock < data.quantity) {
        throw new InsufficientInventoryError(data.sourceLocation, data.quantity, srcStock)
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
        referenceNumber: data.referenceNumber || null,
        referenceType: data.referenceNumber ? 'GATE_PASS' : null,
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

  /**
   * Retroactively recalculate WAC snapshots and profits for all active transactions chronologically.
   * Internal implementation - must be called inside runInTransaction or normal context.
   */
  static async recalculateLedgerInternal(): Promise<void> {
    // 1. Fetch all active transactions sorted by date and creation time ascending
    const activeTxs = await db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(transactions.transactionDate, transactions.createdAt)

    // 2. Track running stock and WAC for all items/locations in memory
    const runningState: Record<string, { stock: number; wac: number }> = {}

    const getRunning = (locationId: string) => {
      if (!runningState[locationId]) {
        runningState[locationId] = { stock: 0, wac: 0 }
      }
      return runningState[locationId]
    }

    // 3. Chronologically process each transaction
    for (const tx of activeTxs) {
      const { id, transactionType, sourceType, sourceId, destinationType, destinationId, quantity } = tx
      
      let unitCost = tx.unitCost
      let averageCostSnapshot = tx.averageCostSnapshot
      let profitSnapshot = tx.profitSnapshot

      if (transactionType === 'PURCHASE' || transactionType === 'OPENING_BALANCE') {
        const dest = getRunning(destinationId)
        const oldStock = dest.stock
        const oldWac = dest.wac
        
        dest.stock += quantity
        if (dest.stock > 0) {
          dest.wac = Math.round((oldStock * oldWac + quantity * unitCost) / dest.stock)
        } else {
          dest.wac = unitCost
        }
        averageCostSnapshot = dest.wac
      } 
      else if (transactionType === 'TRANSFER') {
        const src = getRunning(sourceId)
        const dest = getRunning(destinationId)
        
        unitCost = src.wac
        averageCostSnapshot = src.wac
        
        src.stock = Math.max(0, src.stock - quantity)
        
        const oldDestStock = dest.stock
        const oldDestWac = dest.wac
        
        dest.stock += quantity
        if (dest.stock > 0) {
          dest.wac = Math.round((oldDestStock * oldDestWac + quantity * unitCost) / dest.stock)
        } else {
          dest.wac = unitCost
        }
      } 
      else if (transactionType === 'SALE') {
        const src = getRunning(sourceId)
        
        averageCostSnapshot = src.wac
        profitSnapshot = Math.round(quantity * (tx.sellingRate - averageCostSnapshot))
        
        src.stock = Math.max(0, src.stock - quantity)
      }
      else if (transactionType === 'RETURN') {
        if (sourceId !== 'NONE' && sourceType === 'DRIVER') {
          const src = getRunning(sourceId)
          src.stock = Math.max(0, src.stock - quantity)
        }
        if (destinationId !== 'NONE' && destinationType === 'DRIVER') {
          const dest = getRunning(destinationId)
          const oldStock = dest.stock
          const oldWac = dest.wac
          
          dest.stock += quantity
          if (dest.stock > 0) {
            dest.wac = Math.round((oldStock * oldWac + quantity * unitCost) / dest.stock)
          } else {
            dest.wac = unitCost
          }
          averageCostSnapshot = dest.wac
        }
      }
      else if (transactionType === 'ADJUSTMENT') {
        if (sourceId !== 'NONE') {
          const src = getRunning(sourceId)
          unitCost = src.wac
          averageCostSnapshot = src.wac
          src.stock = Math.max(0, src.stock - quantity)
        } else if (destinationId !== 'NONE') {
          const dest = getRunning(destinationId)
          unitCost = dest.wac
          averageCostSnapshot = dest.wac
          const oldStock = dest.stock
          dest.stock += quantity
          if (dest.stock > 0) {
            dest.wac = Math.round((oldStock * dest.wac + quantity * unitCost) / dest.stock)
          }
        }
      }

      // If any snapshot value changed, write back to DB
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

    // 4. Update the read-through cache snapshots table for all locations
    const now = new Date().toISOString()
    for (const [item, state] of Object.entries(runningState)) {
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
        .values({
          item,
          currentStock: state.stock,
          weightedAverageCost: state.wac,
          lastTransactionId: lastId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: inventoryTable.item,
          set: {
            currentStock: state.stock,
            weightedAverageCost: state.wac,
            lastTransactionId: lastId,
            updatedAt: now,
          },
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
    updatedBy: string
  ) {
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

      // Update in DB
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

      // Trigger retroactive recomputations chronologically
      await this.recalculateLedgerInternal()

      // Retrieve and return updated record
      const updated = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1)

      const ledgerRecord = updated[0]

      // Log update audit trail
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

      return ledgerRecord
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
      referenceNumber?: string
      transactionDate: string
      notes?: string
    },
    updatedBy: string
  ) {
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

      // Validate source driver has sufficient stock (excluding the prior transaction)
      const srcStock = await InventoryService.calculateInventory(data.fromDriverId)
      const priorQty = prior.sourceId === data.fromDriverId ? prior.quantity : 0
      const availableStock = srcStock + priorQty
      if (availableStock < data.quantity) {
        throw new InsufficientInventoryError(
          `Driver ${fromDriver.name}`,
          data.quantity,
          availableStock
        )
      }

      // Update in DB
      await db
        .update(transactions)
        .set({
          sourceId: data.fromDriverId,
          destinationId: data.toDriverId,
          quantity: data.quantity,
          referenceNumber: data.referenceNumber || null,
          transactionDate: data.transactionDate,
          notes: data.notes || null,
          updatedAt: now,
        })
        .where(eq(transactions.id, id))

      // Trigger retroactive recomputations chronologically
      await this.recalculateLedgerInternal()

      // Retrieve and return updated record
      const updated = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1)

      const ledgerRecord = updated[0]

      // Log update audit trail
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

      return ledgerRecord
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
      referenceNumber?: string
      transactionDate: string
      notes?: string
    },
    updatedBy: string
  ) {
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

      // Validate source driver has sufficient stock (excluding the prior transaction quantity)
      const srcStock = await InventoryService.calculateInventory(data.driverId)
      const priorQty = prior.sourceId === data.driverId ? prior.quantity : 0
      const availableStock = srcStock + priorQty
      if (availableStock < data.quantity) {
        throw new InsufficientInventoryError(
          `Driver ${driver.name}`,
          data.quantity,
          availableStock
        )
      }

      // WAC of driver at time of sale
      const sourceWac = await InventoryService.calculateWeightedAverageCost(data.driverId)

      // Calculate profit snapshot
      const profit = Math.round(data.quantity * (data.sellingRate - sourceWac))

      // Update in DB
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
          referenceNumber: data.referenceNumber || null,
          transactionDate: data.transactionDate,
          notes: data.notes || null,
          updatedAt: now,
        })
        .where(eq(transactions.id, id))

      // Trigger retroactive recomputations chronologically
      await this.recalculateLedgerInternal()

      // Retrieve and return updated record
      const updated = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1)

      const ledgerRecord = updated[0]

      // Log update audit trail
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

      return ledgerRecord
    })
  }

  static async list() {
    return txRepo.list()
  }

  static async getById(id: string) {
    return txRepo.getById(id)
  }
}
