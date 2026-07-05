import { eq, or, and, isNull, desc } from 'drizzle-orm'
import { db } from '../db'
import { transactions } from '../schema/schema'
import { ITransactionRepository, Transaction, NewTransaction } from './interfaces'
import crypto from 'crypto'

export class TransactionRepository implements ITransactionRepository {
  async getById(id: string): Promise<Transaction | null> {
    const result = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    return result[0] || null
  }

  async list(): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
  }

  async listBySource(sourceId: string): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(and(eq(transactions.sourceId, sourceId), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
  }

  async listByDestination(destinationId: string): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(and(eq(transactions.destinationId, destinationId), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
  }

  async listByEntity(entityId: string): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(
        and(
          or(eq(transactions.sourceId, entityId), eq(transactions.destinationId, entityId)),
          isNull(transactions.deletedAt)
        )
      )
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
  }

  async create(data: Omit<NewTransaction, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Transaction> {
    const id = data.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const record = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    const result = await db.insert(transactions).values(record).returning()
    return result[0]
  }

  async getLastTransaction(): Promise<Transaction | null> {
    const result = await db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(desc(transactions.createdAt))
      .limit(1)
    return result[0] || null
  }
}
