/**
 * Domain-specific custom Error classes
 */

export class DomainError extends Error {
  public code: string
  
  constructor(message: string, code = 'DOMAIN_ERROR') {
    super(message)
    this.name = this.constructor.name
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class InsufficientInventoryError extends DomainError {
  constructor(item: string, requested: number, available: number) {
    super(
      `Insufficient stock for inventory location "${item}". Requested: ${requested}L, Available: ${available}L.`,
      'INSUFFICIENT_INVENTORY'
    )
  }
}

export class InvalidTransferError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_TRANSFER')
  }
}

export class DriverNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Driver not found with ID: ${id}`, 'DRIVER_NOT_FOUND')
  }
}

export class CustomerNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Customer not found with ID: ${id}`, 'CUSTOMER_NOT_FOUND')
  }
}

export class SupplierNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Supplier not found with ID: ${id}`, 'SUPPLIER_NOT_FOUND')
  }
}

export class VehicleNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Vehicle not found with ID: ${id}`, 'VEHICLE_NOT_FOUND')
  }
}

export class ValidationError extends DomainError {
  public details: Record<string, string[]>

  constructor(message: string, details: Record<string, string[]> = {}) {
    super(message, 'VALIDATION_ERROR')
    this.details = details
  }
}

export class DuplicateTransactionError extends DomainError {
  constructor(transactionNumber: string) {
    super(
      `Duplicate transaction number found: ${transactionNumber}`,
      'DUPLICATE_TRANSACTION'
    )
  }
}
