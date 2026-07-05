import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db'
import { customers } from '../schema/schema'
import { ICustomerRepository, Customer, NewCustomer } from './interfaces'
import crypto from 'crypto'

export class CustomerRepository implements ICustomerRepository {
  async getById(id: string): Promise<Customer | null> {
    const result = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    return result[0] || null
  }

  async list(): Promise<Customer[]> {
    return db.select().from(customers).where(isNull(customers.deletedAt))
  }

  async create(data: Omit<NewCustomer, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Customer> {
    const id = data.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const record = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    const result = await db.insert(customers).values(record).returning()
    return result[0]
  }

  async update(
    id: string,
    data: Partial<Omit<NewCustomer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
  ): Promise<Customer> {
    const now = new Date().toISOString()
    const result = await db
      .update(customers)
      .set({ ...data, updatedAt: now })
      .where(eq(customers.id, id))
      .returning()
    return result[0]
  }

  async delete(id: string): Promise<boolean> {
    const now = new Date().toISOString()
    await db
      .update(customers)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(customers.id, id))
    return true
  }
}
