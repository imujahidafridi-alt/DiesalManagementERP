import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db'
import { auditLogs } from '../schema/schema'
import { IAuditRepository, AuditLog, NewAuditLog } from './interfaces'
import crypto from 'crypto'

export class AuditRepository implements IAuditRepository {
  async create(log: Omit<NewAuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const record = {
      ...log,
      id,
      timestamp: now,
    }
    const result = await db.insert(auditLogs).values(record).returning()
    return result[0]
  }

  async list(entityName?: string, entityId?: string): Promise<AuditLog[]> {
    let query = db.select().from(auditLogs)
    
    if (entityName && entityId) {
      return db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityName, entityName), eq(auditLogs.entityId, entityId)))
        .orderBy(desc(auditLogs.timestamp))
    } else if (entityName) {
      return db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityName, entityName))
        .orderBy(desc(auditLogs.timestamp))
    }

    return query.orderBy(desc(auditLogs.timestamp))
  }
}
