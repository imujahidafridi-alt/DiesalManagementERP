import { SupplierRepository } from '../repositories/SupplierRepository'
import { TransactionRepository } from '../repositories/TransactionRepository'
import { Supplier } from '../repositories/interfaces'
import { AuditService } from './AuditService'

const supplierRepo = new SupplierRepository()
const txRepo = new TransactionRepository()

export interface SupplierStatement {
  totalVolumePurchased: number // in liters
  totalCostPurchased: number // in cents
}

export class SupplierService {
  /**
   * Derive supplier statistics dynamically from the ledger.
   */
  static async getSupplierStatement(supplierId: string): Promise<SupplierStatement> {
    const txs = await txRepo.listByEntity(supplierId)
    
    let totalVolumePurchased = 0
    let totalCostPurchased = 0

    for (const tx of txs) {
      if (tx.sourceId === supplierId && tx.transactionType === 'PURCHASE') {
        totalVolumePurchased += tx.quantity
        totalCostPurchased += Math.round(tx.quantity * tx.unitCost)
      } else if (tx.destinationId === supplierId && tx.transactionType === 'RETURN') {
        totalVolumePurchased -= tx.quantity
        totalCostPurchased -= Math.round(tx.quantity * tx.unitCost)
      }
    }

    return {
      totalVolumePurchased,
      totalCostPurchased,
    }
  }

  static async createSupplier(data: Parameters<SupplierRepository['create']>[0], user: string): Promise<Supplier> {
    const record = await supplierRepo.create(data)
    await AuditService.log('suppliers', record.id, 'CREATE', null, record, user)
    return record
  }

  static async updateSupplier(id: string, data: Parameters<SupplierRepository['update']>[1], user: string): Promise<Supplier> {
    const prior = await supplierRepo.getById(id)
    const updated = await supplierRepo.update(id, data)
    await AuditService.log('suppliers', id, 'UPDATE', prior, updated, user)
    return updated
  }

  static async deleteSupplier(id: string, user: string): Promise<boolean> {
    const prior = await supplierRepo.getById(id)
    await supplierRepo.delete(id)
    await AuditService.log('suppliers', id, 'DELETE', prior, { ...prior, deletedAt: new Date().toISOString() }, user)
    return true
  }

  static async list(): Promise<Supplier[]> {
    return supplierRepo.list()
  }

  static async getById(id: string): Promise<Supplier | null> {
    return supplierRepo.getById(id)
  }
}
