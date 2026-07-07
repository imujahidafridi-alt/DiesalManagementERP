import {
  drivers,
  customers,
  suppliers,
  transactions,
  inventory,
  settings,
  auditLogs,
} from '../schema/schema'

// Select & Insert type definitions inferred from schema
export type Driver = typeof drivers.$inferSelect
export type NewDriver = typeof drivers.$inferInsert

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert

export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert

export type Transaction = typeof transactions.$inferSelect & {
  vehicleNumber?: string | null
}
export type NewTransaction = typeof transactions.$inferInsert & {
  vehicleNumber?: string | null
}

export type Inventory = typeof inventory.$inferSelect
export type NewInventory = typeof inventory.$inferInsert

export type Setting = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert

// Generic Base Repository Interface
export interface IBaseRepository<T, TInsert> {
  getById(id: string): Promise<T | null>
  list(): Promise<T[]>
  create(data: Omit<TInsert, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<T>
  update(id: string, data: Partial<Omit<TInsert, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>): Promise<T>
  delete(id: string): Promise<boolean> // soft delete
}

// Entity Specific Repository Interfaces
export interface IDriverRepository extends IBaseRepository<Driver, NewDriver> {
  listActive(): Promise<Driver[]>
}

export interface ICustomerRepository extends IBaseRepository<Customer, NewCustomer> {}

export interface ISupplierRepository extends IBaseRepository<Supplier, NewSupplier> {}

export interface ITransactionRepository {
  getById(id: string): Promise<Transaction | null>
  list(): Promise<Transaction[]>
  listBySource(sourceId: string): Promise<Transaction[]>
  listByDestination(destinationId: string): Promise<Transaction[]>
  listByEntity(entityId: string): Promise<Transaction[]>
  create(data: Omit<NewTransaction, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Transaction>
  getLastTransaction(): Promise<Transaction | null>
}

export interface IInventoryRepository {
  getSnapshot(item: string): Promise<Inventory | null>
  listSnapshots(): Promise<Inventory[]>
  updateSnapshot(item: string, data: { currentStock: number; weightedAverageCost: number; lastTransactionId: string }): Promise<Inventory>
}

export interface IAuditRepository {
  create(log: Omit<NewAuditLog, 'id' | 'timestamp'>): Promise<AuditLog>
  list(entityName?: string, entityId?: string): Promise<AuditLog[]>
}
