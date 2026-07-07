import { z } from 'zod'
import { EntityType } from './enums'

// ==========================================
// 1. DATABASE VALIDATION SCHEMAS
// ==========================================
export const dbDriverSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
})

export const dbSupplierSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string().min(1).max(255),
  contactPerson: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
})

export const dbCustomerSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string().min(1).max(255),
  contactPerson: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
})


export const dbTransactionSchema = z.object({
  id: z.string().uuid(),
  transactionNumber: z.string().min(1),
  transactionType: z.enum(['PURCHASE', 'TRANSFER', 'SALE', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE']),
  sourceType: z.enum(['DRIVER', 'CUSTOMER', 'SUPPLIER', 'VEHICLE', 'INVENTORY', 'NONE']),
  sourceId: z.string(),
  destinationType: z.enum(['DRIVER', 'CUSTOMER', 'SUPPLIER', 'VEHICLE', 'INVENTORY', 'NONE']),
  destinationId: z.string(),
  quantity: z.number().positive(),
  unitCost: z.number().int().nonnegative(), // stored in cents
  sellingRate: z.number().int().nonnegative(), // stored in cents
  averageCostSnapshot: z.number().int().nonnegative(),
  profitSnapshot: z.number().int().optional(),
  referenceNumber: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  transactionDate: z.string(), // YYYY-MM-DD
  notes: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
})

// ==========================================
// 2. FORM VALIDATION SCHEMAS
// ==========================================
export const driverFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number format').optional().or(z.literal('')),
  address: z.string().max(200, 'Address is too long').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes: z.string().optional(),
})

export const customerFormSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  contactPerson: z.string().min(2, 'Contact person name must be at least 2 characters').optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number format').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export const supplierFormSchema = z.object({
  companyName: z.string().min(2, 'Supplier company name must be at least 2 characters'),
  contactPerson: z.string().optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number format').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
})


export const purchaseFormSchema = z.object({
  supplierId: z.string().uuid('Please select a supplier'),
  destinationLocation: z.string().uuid('Please select a driver'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unitCostDollars: z.coerce.number().positive('Unit cost must be greater than 0'),
  referenceNumber: z.string().min(1, 'Vehicle number is required'),
  transactionDate: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
})

export const saleFormSchema = z.object({
  customerId: z.string().uuid('Please select a customer'),
  sourceLocation: z.string().uuid('Please select a driver'),
  driverId: z.string().uuid('Please select a driver'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  sellingRateDollars: z.coerce.number().positive('Selling rate must be greater than 0'),
  vehicleNumber: z.string().optional(),
  transactionDate: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
})

export const transferFormSchema = z.object({
  sourceLocation: z.string().uuid('Please select a source driver'),
  destinationLocation: z.string().uuid('Please select a destination driver'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  vehicleNumber: z.string().optional(),
  transactionDate: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
})

// ==========================================
// 3. BUSINESS VALIDATION SCHEMAS / RULES
// ==========================================
export const validatePurchaseSchema = z.object({
  sourceType: z.literal(EntityType.SUPPLIER),
  sourceId: z.string().uuid(),
  destinationType: z.literal(EntityType.DRIVER),
  destinationId: z.string().uuid(),
  quantity: z.number().positive().max(1000000),
  unitCost: z.number().int().positive(),
  sellingRate: z.literal(0),
})

export const validateSaleSchema = z.object({
  sourceType: z.literal(EntityType.DRIVER),
  sourceId: z.string().uuid(),
  destinationType: z.literal(EntityType.CUSTOMER),
  destinationId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().int().nonnegative(),
  sellingRate: z.number().int().positive(),
})

export const validateTransferSchema = z.object({
  sourceType: z.literal(EntityType.DRIVER),
  sourceId: z.string().uuid(),
  destinationType: z.literal(EntityType.DRIVER),
  destinationId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().int().nonnegative(),
  sellingRate: z.literal(0),
}).refine((data) => data.sourceId !== data.destinationId, {
  message: 'Source and destination locations cannot be the same',
})
