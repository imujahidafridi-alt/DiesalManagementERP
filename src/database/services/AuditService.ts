import { AuditRepository } from '../repositories/AuditRepository'
import { AuditLog } from '../repositories/interfaces'

const auditRepo = new AuditRepository()

export class AuditService {
  static async log(
    entityName: string,
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE',
    previousData: unknown,
    newData: unknown,
    user: string
  ): Promise<AuditLog> {
    return auditRepo.create({
      entityName,
      entityId,
      action,
      previousData: previousData ? JSON.stringify(previousData) : null,
      newData: newData ? JSON.stringify(newData) : null,
      user,
    })
  }

  static async list(entityName?: string, entityId?: string): Promise<AuditLog[]> {
    return auditRepo.list(entityName, entityId)
  }
}
