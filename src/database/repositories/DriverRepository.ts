import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db'
import { drivers } from '../schema/schema'
import { IDriverRepository, Driver, NewDriver } from './interfaces'
import crypto from 'crypto'

export class DriverRepository implements IDriverRepository {
  async getById(id: string): Promise<Driver | null> {
    const result = await db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, id), isNull(drivers.deletedAt)))
    return result[0] || null
  }

  async list(): Promise<Driver[]> {
    return db.select().from(drivers).where(isNull(drivers.deletedAt))
  }

  async listActive(): Promise<Driver[]> {
    return db
      .select()
      .from(drivers)
      .where(and(eq(drivers.status, 'ACTIVE'), isNull(drivers.deletedAt)))
  }

  async create(data: Omit<NewDriver, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Driver> {
    const id = data.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const record = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    const result = await db.insert(drivers).values(record).returning()
    return result[0]
  }

  async update(
    id: string,
    data: Partial<Omit<NewDriver, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
  ): Promise<Driver> {
    const now = new Date().toISOString()
    const result = await db
      .update(drivers)
      .set({ ...data, updatedAt: now })
      .where(eq(drivers.id, id))
      .returning()
    return result[0]
  }

  async delete(id: string): Promise<boolean> {
    const now = new Date().toISOString()
    await db
      .update(drivers)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(drivers.id, id))
    return true
  }
}
