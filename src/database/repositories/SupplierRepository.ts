import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db'
import { suppliers } from '../schema/schema'
import { ISupplierRepository, Supplier, NewSupplier } from './interfaces'
import crypto from 'crypto'

export class SupplierRepository implements ISupplierRepository {
  async getById(id: string): Promise<Supplier | null> {
    const result = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
    return result[0] || null
  }

  async list(): Promise<Supplier[]> {
    return db.select().from(suppliers).where(isNull(suppliers.deletedAt))
  }

  async create(data: Omit<NewSupplier, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Supplier> {
    const id = data.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const record = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    const result = await db.insert(suppliers).values(record).returning()
    return result[0]
  }

  async update(
    id: string,
    data: Partial<Omit<NewSupplier, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
  ): Promise<Supplier> {
    const now = new Date().toISOString()
    const result = await db
      .update(suppliers)
      .set({ ...data, updatedAt: now })
      .where(eq(suppliers.id, id))
      .returning()
    return result[0]
  }

  async delete(id: string): Promise<boolean> {
    const now = new Date().toISOString()
    await db
      .update(suppliers)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(suppliers.id, id))
    return true
  }
}
