import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// --- 1. Drivers Table ---
export const drivers = sqliteTable(
  'drivers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: text('phone'),
    address: text('address'),
    status: text('status').default('ACTIVE').notNull(), // ACTIVE, INACTIVE
    notes: text('notes'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    deletedIdx: index('drivers_deleted_idx').on(table.deletedAt),
    statusIdx: index('drivers_status_idx').on(table.status),
    nameIdx: index('drivers_name_idx').on(table.name),
  })
)

// --- 2. Suppliers Table ---
export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    companyName: text('company_name').notNull(),
    contactPerson: text('contact_person'),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    deletedIdx: index('suppliers_deleted_idx').on(table.deletedAt),
    companyNameIdx: index('suppliers_company_name_idx').on(table.companyName),
  })
)

// --- 3. Customers Table ---
export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    companyName: text('company_name').notNull(),
    contactPerson: text('contact_person'),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    deletedIdx: index('customers_deleted_idx').on(table.deletedAt),
    companyNameIdx: index('customers_company_name_idx').on(table.companyName),
  })
)


// --- 5. Transactions Table (The Core Ledger) ---
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    transactionNumber: text('transaction_number').unique().notNull(), // TX-PUR-001, TX-SAL-102 etc.
    transactionType: text('transaction_type').notNull(), // PURCHASE, TRANSFER, SALE, RETURN, ADJUSTMENT, OPENING_BALANCE
    
    // Polymorphic Source (Supplier, Driver, Inventory tank, Customer, or NONE)
    sourceType: text('source_type').notNull(), // SUPPLIER, DRIVER, CUSTOMER, INVENTORY, NONE etc.
    sourceId: text('source_id').notNull(), // UUID or 'NONE'
    
    // Polymorphic Destination
    destinationType: text('destination_type').notNull(), // CUSTOMER, DRIVER, INVENTORY, NONE etc.
    destinationId: text('destination_id').notNull(), // UUID or 'NONE'
    
    quantity: real('quantity').notNull(), // Volume in liters (e.g. 150.50)
    unitCost: integer('unit_cost').notNull(), // Purchase unit cost in cents
    sellingRate: integer('selling_rate').notNull(), // Sale rate in cents (0 for transfers)
    
    averageCostSnapshot: integer('average_cost_snapshot').notNull(), // WAC in cents at time of transaction
    profitSnapshot: integer('profit_snapshot').notNull(), // Profit generated in cents (0 for non-sales)
    
    referenceNumber: text('reference_number'), // Invoice/receipt number
    referenceType: text('reference_type'), // E.g., 'INVOICE', 'GATE_PASS', 'CHALLAN'
    transactionDate: text('transaction_date').notNull(), // ISO Date String (YYYY-MM-DD)
    
    notes: text('notes'),
    createdBy: text('created_by').notNull(), // operator user
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    sourceIdx: index('tx_source_idx').on(table.sourceId),
    destIdx: index('tx_dest_idx').on(table.destinationId),
    dateIdx: index('tx_date_idx').on(table.transactionDate),
    typeIdx: index('tx_type_idx').on(table.transactionType),
    deletedIdx: index('tx_deleted_idx').on(table.deletedAt),
    createdAtIdx: index('tx_created_at_idx').on(table.createdAt),
    refNumIdx: index('tx_ref_num_idx').on(table.referenceNumber),
    keysetIdx: index('tx_keyset_idx').on(table.transactionDate, table.createdAt, table.id),
  })
)

// --- 6. Inventory Snapshots Table (Cache only) ---
export const inventory = sqliteTable('inventory', {
  item: text('item').primaryKey(), // location identifier (e.g. Tank A, Truck Plate Number)
  currentStock: real('current_stock').default(0.0).notNull(), // current stock in liters
  weightedAverageCost: integer('weighted_average_cost').default(0).notNull(), // current WAC in cents
  lastTransactionId: text('last_transaction_id'),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
})

// --- 7. Settings Table ---
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').unique().notNull(),
  value: text('value').notNull(),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
})

// --- 8. Audit Logs Table ---
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    entityName: text('entity_name').notNull(), // drivers, customers, transactions, etc.
    entityId: text('entity_id').notNull(), // ID of target row
    action: text('action').notNull(), // CREATE, UPDATE, DELETE, RESTORE
    previousData: text('previous_data'), // JSON snapshot (optional)
    newData: text('new_data'), // JSON snapshot (optional)
    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
    user: text('user').notNull(), // operator username
  },
  (table) => ({
    entityIdx: index('audit_entity_idx').on(table.entityName, table.entityId),
    timestampIdx: index('audit_timestamp_idx').on(table.timestamp),
  })
)
