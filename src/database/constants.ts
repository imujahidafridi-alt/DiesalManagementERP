/**
 * Centralized Constants for Diesel Inventory ERP
 */

export const PRECISION = {
  CURRENCY_DECIMALS: 2, // monetary values stored as integers in cents
  QUANTITY_DECIMALS: 2, // diesel quantities stored as floats (real) in liters
}

export const LIMITS = {
  MAX_QUANTITY: 1_000_000, // Maximum allowed diesel quantity per single transaction (liters)
  MAX_RATE_CENTS: 1_000_000, // Maximum rate per liter in cents ($10,000.00)
}

export const PREFIXES = {
  TRANSACTION_NUMBER: 'TX-',
  PURCHASE: 'PUR-',
  SALE: 'SAL-',
  TRANSFER: 'TRF-',
  ADJUSTMENT: 'ADJ-',
  RETURN: 'RET-',
  OPENING_BALANCE: 'OPB-',
}

export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DD',
  DISPLAY: 'MMM DD, YYYY',
}

export const DEFAULTS = {
  DRIVER_STATUS: 'ACTIVE',
  VEHICLE_STATUS: 'ACTIVE',
  CUSTOMER_STATUS: 'ACTIVE',
  SUPPLIER_STATUS: 'ACTIVE',
}
