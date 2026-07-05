import { db, runInTransaction } from '../db'
import { drivers, customers, suppliers, transactions, inventory as inventoryTable, auditLogs } from '../schema/schema'
import crypto from 'crypto'
import { generateNextTransactionNumber } from '../utils/numbering'
import { Logger } from '../../utils/Logger'
import { eq } from 'drizzle-orm'

export interface ImportResult {
  imported: number
  skipped: number
  failed: number
  executionTimeMs: number
  errors: string[]
}

export class ImportService {
  static async importRecords(entityType: string, rows: any[], user: string): Promise<ImportResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let imported = 0

    Logger.info(`Starting data migration import for entity type: ${entityType}. Rows count: ${rows.length}`)

    if (!rows || rows.length === 0) {
      return { imported: 0, skipped: 0, failed: 0, executionTimeMs: 0, errors: ['No data rows to import'] }
    }

    try {
      // 1. Fetch reference collections to validate references
      const existingDrivers = await db.select().from(drivers)
      const existingCustomers = await db.select().from(customers)
      const existingSuppliers = await db.select().from(suppliers)
      const existingInventory = await db.select().from(inventoryTable)

      // Cache maps for fast lookup
      const driverMap = new Map(existingDrivers.map(d => [d.id, d]))
      const driverNameMap = new Map(existingDrivers.map(d => [d.name.toLowerCase().trim(), d]))
      const customerMap = new Map(existingCustomers.map(c => [c.id, c]))
      const customerNameMap = new Map(existingCustomers.map(c => [c.companyName.toLowerCase().trim(), c]))
      const supplierMap = new Map(existingSuppliers.map(s => [s.id, s]))
      const supplierNameMap = new Map(existingSuppliers.map(s => [s.companyName.toLowerCase().trim(), s]))

      // Running cache for transaction WACs & stocks during import
      const runningInventory = new Map<string, { stock: number; wac: number }>()
      existingInventory.forEach((inv) => {
        runningInventory.set(inv.item, { stock: inv.currentStock, wac: inv.weightedAverageCost })
      })

      // Ensure Main Tank A is in cache
      if (!runningInventory.has('Main Tank A')) {
        runningInventory.set('Main Tank A', { stock: 0, wac: 0 })
      }

      // First Pass: VALIDATION ONLY (does not write to DB)
      rows.forEach((row, idx) => {
        const lineNum = idx + 1

        if (entityType === 'DRIVER') {
          if (!row.name || !String(row.name).trim()) {
            errors.push(`Row ${lineNum}: Driver Name is required`)
          }
        } else if (entityType === 'CUSTOMER') {
          if (!row.companyName || !String(row.companyName).trim()) {
            errors.push(`Row ${lineNum}: Customer Company Name is required`)
          }
        } else if (entityType === 'SUPPLIER') {
          if (!row.companyName || !String(row.companyName).trim()) {
            errors.push(`Row ${lineNum}: Supplier Company Name is required`)
          }

        } else if (entityType === 'PURCHASE') {
          const qty = parseFloat(row.quantity)
          const cost = parseFloat(row.unitCost)
          if (isNaN(qty) || qty <= 0) errors.push(`Row ${lineNum}: Quantity must be positive number`)
          if (isNaN(cost) || cost <= 0) errors.push(`Row ${lineNum}: Unit cost must be positive number`)
          if (!row.transactionDate) errors.push(`Row ${lineNum}: Date is required (YYYY-MM-DD)`)

          // Resolve Supplier reference
          const rawSup = String(row.supplierId || '').trim().toLowerCase()
          const matchedSup = supplierMap.get(row.supplierId) || supplierNameMap.get(rawSup)
          if (!matchedSup) {
            errors.push(`Row ${lineNum}: Supplier ID/Name not found: ${row.supplierId}`)
          } else {
            row.resolvedSupplierId = matchedSup.id
          }

          // Resolve Driver reference
          const rawDrv = String(row.destinationLocation || '').trim().toLowerCase()
          const matchedDrv = driverMap.get(row.destinationLocation) || driverNameMap.get(rawDrv)
          if (!matchedDrv) {
            errors.push(`Row ${lineNum}: Driver ID/Name not found: ${row.destinationLocation}`)
          } else {
            row.resolvedDriverId = matchedDrv.id
          }

          if (!row.referenceNumber || !String(row.referenceNumber).trim()) {
            errors.push(`Row ${lineNum}: Vehicle number is required`)
          }
        } else if (entityType === 'SALE') {
          const qty = parseFloat(row.quantity)
          const rate = parseFloat(row.sellingRate)
          if (isNaN(qty) || qty <= 0) errors.push(`Row ${lineNum}: Quantity must be positive number`)
          if (isNaN(rate) || rate <= 0) errors.push(`Row ${lineNum}: Selling rate must be positive number`)
          if (!row.transactionDate) errors.push(`Row ${lineNum}: Date is required (YYYY-MM-DD)`)

          // Resolve Customer
          const rawCust = String(row.customerId || '').trim().toLowerCase()
          const matchedCust = customerMap.get(row.customerId) || customerNameMap.get(rawCust)
          if (!matchedCust) {
            errors.push(`Row ${lineNum}: Customer ID/Name not found: ${row.customerId}`)
          } else {
            row.resolvedCustomerId = matchedCust.id
          }

          // Resolve Driver
          const rawDrv = String(row.driverId || '').trim().toLowerCase()
          const matchedDrv = driverMap.get(row.driverId) || driverNameMap.get(rawDrv)
          if (!matchedDrv) {
            errors.push(`Row ${lineNum}: Driver ID/Name not found: ${row.driverId}`)
          } else {
            row.resolvedDriverId = matchedDrv.id
          }
        } else if (entityType === 'TRANSFER') {
          const qty = parseFloat(row.quantity)
          if (isNaN(qty) || qty <= 0) errors.push(`Row ${lineNum}: Quantity must be positive number`)
          if (!row.transactionDate) errors.push(`Row ${lineNum}: Date is required (YYYY-MM-DD)`)

          // Resolve From Location
          const rawFrom = String(row.fromLocation || '').trim().toLowerCase()
          const matchedFromDrv = driverMap.get(row.fromLocation) || driverNameMap.get(rawFrom)
          if (matchedFromDrv) {
            row.resolvedFromId = matchedFromDrv.id
            row.resolvedFromType = 'DRIVER'
          } else {
            errors.push(`Row ${lineNum}: Unknown source driver location: ${row.fromLocation}`)
          }

          // Resolve To Location
          const rawTo = String(row.toLocation || '').trim().toLowerCase()
          const matchedToDrv = driverMap.get(row.toLocation) || driverNameMap.get(rawTo)
          if (matchedToDrv) {
            row.resolvedToId = matchedToDrv.id
            row.resolvedToType = 'DRIVER'
          } else {
            errors.push(`Row ${lineNum}: Unknown destination driver location: ${row.toLocation}`)
          }
        }
      })

      // If validation failed, reject import completely
      if (errors.length > 0) {
        Logger.warn(`Data migration import failed validation. Found ${errors.length} errors.`)
        return {
          imported: 0,
          skipped: 0,
          failed: rows.length,
          executionTimeMs: Date.now() - startTime,
          errors,
        }
      }

      // Sort transactions chronologically to build correct WAC layers
      if (['PURCHASE', 'SALE', 'TRANSFER'].includes(entityType)) {
        rows.sort((a, b) => String(a.transactionDate).localeCompare(String(b.transactionDate)))
      }

      // Second Pass: COMMIT TRANSACTION WRAPPER
      await runInTransaction(async () => {
        const tx = db
        for (const row of rows) {
          const id = crypto.randomUUID()
          const now = new Date().toISOString()

          if (entityType === 'DRIVER') {
            await tx.insert(drivers).values({
              id,
              name: String(row.name),
              phone: row.phone ? String(row.phone) : null,
              address: row.address ? String(row.address) : null,
              notes: row.notes ? String(row.notes) : null,
              status: row.status || 'ACTIVE',
              createdAt: now,
              updatedAt: now,
            })
            await tx.insert(auditLogs).values({
              id: crypto.randomUUID(),
              entityName: 'drivers',
              entityId: id,
              action: 'CREATE',
              newData: JSON.stringify(row),
              user,
              timestamp: now,
            })
            imported++
          } else if (entityType === 'CUSTOMER') {
            // Serialize virtual fields inside customers notes
            const payload = {
              email: row.email || '',
              taxNumber: row.taxNumber || '',
              status: row.status || 'ACTIVE',
              notes: row.notes || '',
            }
            await tx.insert(customers).values({
              id,
              companyName: String(row.companyName),
              contactPerson: row.contactPerson ? String(row.contactPerson) : null,
              phone: row.phone ? String(row.phone) : null,
              address: row.address ? String(row.address) : null,
              notes: JSON.stringify(payload),
              createdAt: now,
              updatedAt: now,
            })
            await tx.insert(auditLogs).values({
              id: crypto.randomUUID(),
              entityName: 'customers',
              entityId: id,
              action: 'CREATE',
              newData: JSON.stringify(row),
              user,
              timestamp: now,
            })
            imported++
          } else if (entityType === 'SUPPLIER') {
            await tx.insert(suppliers).values({
              id,
              companyName: String(row.companyName),
              contactPerson: row.contactPerson ? String(row.contactPerson) : null,
              phone: row.phone ? String(row.phone) : null,
              address: row.address ? String(row.address) : null,
              notes: row.notes ? String(row.notes) : null,
              createdAt: now,
              updatedAt: now,
            })
            await tx.insert(auditLogs).values({
              id: crypto.randomUUID(),
              entityName: 'suppliers',
              entityId: id,
              action: 'CREATE',
              newData: JSON.stringify(row),
              user,
              timestamp: now,
            })
            imported++

          } else if (entityType === 'PURCHASE') {
            const qty = parseFloat(row.quantity)
            const costCents = Math.round(parseFloat(row.unitCost) * 100)
            const dest = row.resolvedDriverId
            const txNumber = await generateNextTransactionNumber('PURCHASE', tx)

            // Update running cache of destination
            const state = runningInventory.get(dest) || { stock: 0, wac: 0 }
            const prevStock = state.stock
            const newStock = prevStock + qty
            const newWac = newStock > 0 
              ? Math.round((prevStock * state.wac + qty * costCents) / newStock)
              : costCents
            runningInventory.set(dest, { stock: newStock, wac: newWac })

            await tx.insert(transactions).values({
              id,
              transactionNumber: txNumber,
              transactionType: 'PURCHASE',
              sourceType: 'SUPPLIER',
              sourceId: row.resolvedSupplierId,
              destinationType: 'DRIVER',
              destinationId: dest,
              quantity: qty,
              unitCost: costCents,
              sellingRate: 0,
              averageCostSnapshot: newWac,
              profitSnapshot: 0,
              referenceNumber: row.referenceNumber ? String(row.referenceNumber) : null,
              referenceType: 'VEHICLE_NO',
              transactionDate: String(row.transactionDate),
              notes: row.notes ? String(row.notes) : null,
              createdBy: user,
              createdAt: now,
              updatedAt: now,
            })
            imported++
          } else if (entityType === 'SALE') {
            const qty = parseFloat(row.quantity)
            const rateCents = Math.round(parseFloat(row.sellingRate) * 100)
            const src = row.resolvedDriverId
            const txNumber = await generateNextTransactionNumber('SALE', tx)

            // Get source WAC
            const state = runningInventory.get(src) || { stock: 0, wac: 0 }
            const averageCostSnapshot = state.wac
            const profitCents = Math.round(qty * (rateCents - averageCostSnapshot))

            // Update source stock
            runningInventory.set(src, { stock: Math.max(0, state.stock - qty), wac: state.wac })

            await tx.insert(transactions).values({
              id,
              transactionNumber: txNumber,
              transactionType: 'SALE',
              sourceType: 'DRIVER',
              sourceId: src,
              destinationType: 'CUSTOMER',
              destinationId: row.resolvedCustomerId,
              quantity: qty,
              unitCost: averageCostSnapshot,
              sellingRate: rateCents,
              averageCostSnapshot,
              profitSnapshot: profitCents,
              referenceNumber: row.referenceNumber ? String(row.referenceNumber) : null,
              referenceType: row.referenceNumber ? 'DELIVERY_NOTE' : null,
              transactionDate: String(row.transactionDate),
              notes: row.notes ? String(row.notes) : null,
              createdBy: user,
              createdAt: now,
              updatedAt: now,
            })
            imported++
          } else if (entityType === 'TRANSFER') {
            const qty = parseFloat(row.quantity)
            const src = row.resolvedFromId
            const dest = row.resolvedToId
            const txNumber = await generateNextTransactionNumber('TRANSFER', tx)

            // Get source WAC
            const srcState = runningInventory.get(src) || { stock: 0, wac: 0 }
            const carrierWac = srcState.wac

            // Update source stock
            runningInventory.set(src, { stock: Math.max(0, srcState.stock - qty), wac: carrierWac })

            // Update destination stock and WAC
            const destState = runningInventory.get(dest) || { stock: 0, wac: 0 }
            const prevDestStock = destState.stock
            const newDestStock = prevDestStock + qty
            const newDestWac = newDestStock > 0
              ? Math.round((prevDestStock * destState.wac + qty * carrierWac) / newDestStock)
              : carrierWac
            runningInventory.set(dest, { stock: newDestStock, wac: newDestWac })

            await tx.insert(transactions).values({
              id,
              transactionNumber: txNumber,
              transactionType: 'TRANSFER',
              sourceType: 'DRIVER',
              sourceId: src,
              destinationType: 'DRIVER',
              destinationId: dest,
              quantity: qty,
              unitCost: carrierWac,
              sellingRate: 0,
              averageCostSnapshot: carrierWac,
              profitSnapshot: 0,
              referenceNumber: row.referenceNumber ? String(row.referenceNumber) : null,
              referenceType: row.referenceNumber ? 'GATE_PASS' : null,
              transactionDate: String(row.transactionDate),
              notes: row.notes ? String(row.notes) : null,
              createdBy: user,
              createdAt: now,
              updatedAt: now,
            })
            imported++
          }
        }

        // Commit running inventory WAC / stock cache snapshots to SQLite
        for (const [location, state] of runningInventory.entries()) {
          // Check if snapshot exists
          const match = await tx.select().from(inventoryTable).where(eq(inventoryTable.item, location))
          if (match.length > 0) {
            await tx
              .update(inventoryTable)
              .set({
                currentStock: state.stock,
                weightedAverageCost: state.wac,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(inventoryTable.item, location))
          } else {
            await tx.insert(inventoryTable).values({
              item: location,
              currentStock: state.stock,
              weightedAverageCost: state.wac,
              updatedAt: new Date().toISOString(),
            })
          }
        }
      })

      Logger.info(`Data migration successfully completed. ${imported} rows added.`)
      return {
        imported,
        skipped: 0,
        failed: 0,
        executionTimeMs: Date.now() - startTime,
        errors: [],
      }
    } catch (e: any) {
      Logger.error('Failed executing batch import', e)
      return {
        imported: 0,
        skipped: 0,
        failed: rows.length,
        executionTimeMs: Date.now() - startTime,
        errors: [e.message || 'Fatal database transaction error occurred'],
      }
    }
  }
}
