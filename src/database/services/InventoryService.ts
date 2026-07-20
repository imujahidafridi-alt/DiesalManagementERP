import { TransactionRepository } from '../repositories/TransactionRepository'
import { InventoryRepository } from '../repositories/InventoryRepository'
import { Inventory } from '../repositories/interfaces'
import { InsufficientInventoryError } from '../errors'
import { SettingsService } from './SettingsService'

const txRepo = new TransactionRepository()
const invRepo = new InventoryRepository()

export class InventoryService {
  /**
   * Derive current stock for a location by chronologically summing transaction ledger movements.
   * Source of truth: Transaction Ledger.
   */
  static async calculateInventory(item: string, upToDate?: string): Promise<number> {
    const txs = await txRepo.listByEntity(item)
    // Filter chronologically (ascending)
    const sortedTxs = [...txs].reverse()
    
    let stock = 0
    for (const tx of sortedTxs) {
      if (upToDate && tx.transactionDate > upToDate) {
        continue
      }
      
      if (tx.destinationId === item) {
        // Diesel entering the location
        stock += tx.quantity
      } else if (tx.sourceId === item) {
        // Diesel leaving the location
        stock -= tx.quantity
      }
    }
    return stock
  }

  /**
   * Derive Weighted Average Cost (WAC) for a location by iterating chronologically.
   * Formula: New WAC = (Prior Stock * Prior WAC + Quantity In * Inflow Cost) / (Prior Stock + Quantity In)
   */
  static async calculateWeightedAverageCost(item: string, upToDate?: string): Promise<number> {
    const txs = await txRepo.listByEntity(item)
    const sortedTxs = [...txs].reverse()

    let stock = 0
    let wac = 0 // in cents

    for (const tx of sortedTxs) {
      if (upToDate && tx.transactionDate > upToDate) {
        continue
      }

      if (tx.destinationId === item) {
        const qtyIn = tx.quantity
        // Purchases establish unitCost, transfers carry averageCostSnapshot, opening balance has unitCost
        const costIn = tx.transactionType === 'PURCHASE' || tx.transactionType === 'OPENING_BALANCE' 
          ? tx.unitCost 
          : tx.averageCostSnapshot

        const previousStock = Math.max(0, stock)
        stock += qtyIn

        if (stock > 0 && qtyIn > 0 && costIn > 0) {
          wac = Math.round((previousStock * wac + qtyIn * costIn) / stock)
        }
      } else if (tx.sourceId === item) {
        // Sales and Transfers consume stock at the current WAC, keeping the WAC constant
        stock = stock - tx.quantity
      }
    }
    return wac
  }

  /**
   * Rebuilds the cache snapshot of an item from derived ledger values and writes it to DB.
   */
  static async rebuildSnapshot(item: string): Promise<Inventory> {
    const stock = await this.calculateInventory(item)
    const wac = await this.calculateWeightedAverageCost(item)
    
    // Find last transaction ID affecting the entity
    const txs = await txRepo.listByEntity(item)
    const lastTxId = txs[0]?.id || 'NONE'

    return invRepo.updateSnapshot(item, {
      currentStock: stock,
      weightedAverageCost: wac,
      lastTransactionId: lastTxId,
    })
  }

  /**
   * Fetches the cached snapshot or rebuilds it if missing
   */
  static async getSnapshot(item: string): Promise<Inventory> {
    const cached = await invRepo.getSnapshot(item)
    if (cached) return cached
    return this.rebuildSnapshot(item)
  }

  /**
   * Validates if a source location has sufficient inventory for an transaction quantity.
   */
  static async validateInventory(item: string, quantityNeeded: number): Promise<void> {
    const currentStock = await this.calculateInventory(item)
    if (currentStock < quantityNeeded) {
      const config = await SettingsService.getSettings()
      const unit = config.quantity_abbreviation || 'Gal'
      throw new InsufficientInventoryError(item, quantityNeeded, currentStock, unit)
    }
  }

  static async listSnapshots(): Promise<Inventory[]> {
    return invRepo.listSnapshots()
  }
}
