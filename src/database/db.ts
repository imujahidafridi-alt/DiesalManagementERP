import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema/schema'
import path from 'path'
import { app } from 'electron'

// Detect if running inside Electron Main process
const isElectron = typeof process !== 'undefined' && process.versions && !!process.versions.electron

export let dbPath: string
export let sqlite: any

const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'

if (isTest) {
  dbPath = ':memory:'
  sqlite = new Database(dbPath)
} else if (isElectron) {
  // Store database file in a fixed application data directory
  // Using a fixed folder name so renaming the app never moves the database
  const appDataPath = app.getPath('appData')
  const fixedFolder = path.join(appDataPath, 'SGGTransport')
  // Ensure the folder exists
  require('fs').mkdirSync(fixedFolder, { recursive: true })
  dbPath = path.join(fixedFolder, 'diesel_erp.db')
  sqlite = new Database(dbPath)
} else {
  // Fallback for migrations or script runs
  dbPath = path.join(process.cwd(), 'diesel_erp.db')
  sqlite = new Database(dbPath)
}

// Enforce foreign key constraints
sqlite.pragma('foreign_keys = ON')

// Enable write-ahead logging (WAL) for better concurrent performance
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })

// Synchronous startup migration helper to convert database transactions to driver-centric
function runMigration() {
  const { transactions: txTable, drivers: drvTable, inventory: invTable } = schema
  const { eq, isNull } = require('drizzle-orm')
  const crypto = require('crypto')

  try {
    // Check if vehicles table exists
    const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'").get()
    if (!tableCheck) {
      return
    }

    // 1. Fetch all drivers, vehicles, transactions
    const allDrivers = sqlite.prepare("SELECT * FROM drivers").all() as any[]
    allDrivers.forEach(d => {
      if (d.vehicle_id !== undefined) {
        d.vehicleId = d.vehicle_id
      }
    })
    const allVehicles = sqlite.prepare("SELECT * FROM vehicles").all() as any[]
    const activeTxs = db.select().from(txTable).where(isNull(txTable.deletedAt)).all()

    if (activeTxs.length === 0) return

    // Find first active driver to assign legacy tank inventory
    let defaultDriverId = ''
    const firstDriver = allDrivers.find(d => d.status === 'ACTIVE')
    if (firstDriver) {
      defaultDriverId = firstDriver.id
    } else {
      // Create a default driver
      defaultDriverId = crypto.randomUUID()
      const now = new Date().toISOString()
      db.insert(drvTable).values({
        id: defaultDriverId,
        name: 'Default Driver',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      }).run()
      allDrivers.push({
        id: defaultDriverId,
        name: 'Default Driver',
        phone: null,
        address: null,
        notes: null,
        status: 'ACTIVE',
        vehicleId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
    }

    let migrationPerformed = false

    for (const tx of activeTxs) {
      let needsUpdate = false
      const updateData: any = {}

      // A. Legacy Purchase (destinationType was INVENTORY)
      if (tx.transactionType === 'PURCHASE' && tx.destinationType === 'INVENTORY') {
        updateData.destinationType = 'DRIVER'
        updateData.destinationId = defaultDriverId
        updateData.referenceType = 'VEHICLE_NO'
        needsUpdate = true
      }

      // B. Legacy Transfer
      if (tx.transactionType === 'TRANSFER') {
        if (tx.sourceType === 'INVENTORY' && tx.destinationType === 'VEHICLE') {
          // Soft-delete Tank-to-Vehicle transfers to prevent double-counting driver stock
          updateData.deletedAt = new Date().toISOString()
          needsUpdate = true
        } else if (tx.sourceType === 'VEHICLE' && tx.destinationType === 'VEHICLE') {
          // Map vehicle IDs to driver IDs
          const srcVeh = allVehicles.find(v => v.id === tx.sourceId)
          const srcDrv = allDrivers.find(d => d.id === srcVeh?.assignedDriverId || d.vehicleId === tx.sourceId)
          
          const destVeh = allVehicles.find(v => v.id === tx.destinationId)
          const destDrv = allDrivers.find(d => d.id === destVeh?.assignedDriverId || d.vehicleId === tx.destinationId)

          updateData.sourceType = 'DRIVER'
          updateData.sourceId = srcDrv ? srcDrv.id : defaultDriverId
          updateData.destinationType = 'DRIVER'
          updateData.destinationId = destDrv ? destDrv.id : defaultDriverId
          needsUpdate = true
        }
      }

      // C. Legacy Sale (sourceType was VEHICLE)
      if (tx.transactionType === 'SALE' && tx.sourceType === 'VEHICLE') {
        const veh = allVehicles.find(v => v.id === tx.sourceId)
        const drv = allDrivers.find(d => d.id === veh?.assignedDriverId || d.vehicleId === tx.sourceId)

        updateData.sourceType = 'DRIVER'
        updateData.sourceId = drv ? drv.id : defaultDriverId
        needsUpdate = true
      }

      if (needsUpdate) {
        db.update(txTable).set(updateData).where(eq(txTable.id, tx.id)).run()
        migrationPerformed = true
      }
    }

    if (migrationPerformed) {
      console.log('Database schema successfully migrated to driver-centric transactions!')
      
      // Chronologically rebuild all snapshots
      const activeTxsNew = db.select().from(txTable).where(isNull(txTable.deletedAt)).all()
      activeTxsNew.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.createdAt.localeCompare(b.createdAt))
      
      const runningState: Record<string, { stock: number; wac: number }> = {}
      for (const tx of activeTxsNew) {
        const { id, transactionType, sourceId, destinationId, quantity } = tx
        let unitCost = tx.unitCost
        let averageCostSnapshot = tx.averageCostSnapshot
        let profitSnapshot = tx.profitSnapshot

        const getRunning = (loc: string) => {
          if (!runningState[loc]) runningState[loc] = { stock: 0, wac: 0 }
          return runningState[loc]
        }

        if (transactionType === 'PURCHASE' || transactionType === 'OPENING_BALANCE') {
          const dest = getRunning(destinationId)
          const oldStock = dest.stock
          const oldWac = dest.wac
          dest.stock += quantity
          dest.wac = dest.stock > 0 ? Math.round((oldStock * oldWac + quantity * unitCost) / dest.stock) : unitCost
          averageCostSnapshot = dest.wac
        } else if (transactionType === 'TRANSFER') {
          const src = getRunning(sourceId)
          const dest = getRunning(destinationId)
          unitCost = src.wac
          averageCostSnapshot = src.wac
          src.stock = Math.max(0, src.stock - quantity)
          const oldDestStock = dest.stock
          const oldDestWac = dest.wac
          dest.stock += quantity
          dest.wac = dest.stock > 0 ? Math.round((oldDestStock * oldDestWac + quantity * unitCost) / dest.stock) : unitCost
        } else if (transactionType === 'SALE') {
          const src = getRunning(sourceId)
          averageCostSnapshot = src.wac
          profitSnapshot = Math.round(quantity * (tx.sellingRate - averageCostSnapshot))
          src.stock = Math.max(0, src.stock - quantity)
        }

        db.update(txTable).set({ unitCost, averageCostSnapshot, profitSnapshot }).where(eq(txTable.id, id)).run()
      }

      // Re-populate inventory snapshots
      db.delete(invTable).run()
      for (const [item, state] of Object.entries(runningState)) {
        db.insert(invTable).values({
          item,
          currentStock: state.stock,
          weightedAverageCost: state.wac,
          updatedAt: new Date().toISOString()
        }).run()
      }
    }
  } catch (err) {
    console.error('Failed to run driver-centric database migration:', err)
  }
}

try {
  runMigration()
  sqlite.prepare("UPDATE transactions SET created_by = 'Haroon Wazir' WHERE created_by = 'Default Operator'").run()
  sqlite.prepare("UPDATE audit_logs SET user = 'Haroon Wazir' WHERE user = 'Default Operator'").run()
} catch (e) {
  console.error('Startup migration execution error:', e)
}

// Asynchronous transaction queue to serialize write operations on SQLite
let writeQueue = Promise.resolve<unknown>(null)

export async function runInTransaction<T>(action: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    writeQueue = writeQueue.then(async () => {
      const inTx = sqlite.inTransaction
      if (!inTx) sqlite.exec('BEGIN')
      try {
        const result = await action()
        if (!inTx) sqlite.exec('COMMIT')
        resolve(result)
      } catch (error) {
        if (!inTx) sqlite.exec('ROLLBACK')
        reject(error)
      }
    }).catch(() => {
      // Catch queue rejections to prevent blocking subsequent transactions
    })
  })
}

