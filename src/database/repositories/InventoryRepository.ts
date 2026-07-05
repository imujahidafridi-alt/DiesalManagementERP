import { eq } from 'drizzle-orm'
import { db } from '../db'
import { inventory } from '../schema/schema'
import { IInventoryRepository, Inventory } from './interfaces'

export class InventoryRepository implements IInventoryRepository {
  async getSnapshot(item: string): Promise<Inventory | null> {
    const result = await db.select().from(inventory).where(eq(inventory.item, item))
    return result[0] || null
  }

  async listSnapshots(): Promise<Inventory[]> {
    return db.select().from(inventory)
  }

  async updateSnapshot(
    item: string,
    data: { currentStock: number; weightedAverageCost: number; lastTransactionId: string }
  ): Promise<Inventory> {
    const now = new Date().toISOString()
    const current = await this.getSnapshot(item)

    if (current) {
      const result = await db
        .update(inventory)
        .set({
          currentStock: data.currentStock,
          weightedAverageCost: data.weightedAverageCost,
          lastTransactionId: data.lastTransactionId,
          updatedAt: now,
        })
        .where(eq(inventory.item, item))
        .returning()
      return result[0]
    } else {
      const result = await db
        .insert(inventory)
        .values({
          item,
          currentStock: data.currentStock,
          weightedAverageCost: data.weightedAverageCost,
          lastTransactionId: data.lastTransactionId,
          updatedAt: now,
        })
        .returning()
      return result[0]
    }
  }
}
