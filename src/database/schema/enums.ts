/**
 * Domain-specific centralized Enums
 */

export const TransactionType = {
  PURCHASE: 'PURCHASE',
  TRANSFER: 'TRANSFER',
  SALE: 'SALE',
  RETURN: 'RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  OPENING_BALANCE: 'OPENING_BALANCE',
} as const

export type TransactionType = typeof TransactionType[keyof typeof TransactionType]

export const EntityType = {
  DRIVER: 'DRIVER',
  CUSTOMER: 'CUSTOMER',
  SUPPLIER: 'SUPPLIER',
  VEHICLE: 'VEHICLE',
  INVENTORY: 'INVENTORY',
  NONE: 'NONE',
} as const

export type EntityType = typeof EntityType[keyof typeof EntityType]

export const DriverStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const

export type DriverStatus = typeof DriverStatus[keyof typeof DriverStatus]

export const VehicleStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MAINTENANCE: 'MAINTENANCE',
} as const

export type VehicleStatus = typeof VehicleStatus[keyof typeof VehicleStatus]

export const CustomerStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const

export type CustomerStatus = typeof CustomerStatus[keyof typeof CustomerStatus]

export const SupplierStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const

export type SupplierStatus = typeof SupplierStatus[keyof typeof SupplierStatus]

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
} as const

export type AuditAction = typeof AuditAction[keyof typeof AuditAction]
