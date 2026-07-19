import { db } from '../db'
import { transactions, drivers, customers, suppliers, auditLogs, inventory } from '../schema/schema'
import { eq, and, or, like, isNull, desc, asc, sql, count } from 'drizzle-orm'

export interface GridQueryPayload {
  gridId: 'purchases' | 'sales' | 'transfers' | 'drivers' | 'customers' | 'suppliers' | 'inventory' | 'audit'
  page: number
  pageSize: number
  search?: string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  filters?: Record<string, any>
  cursor?: string
}

export interface GridResponse {
  rows: any[]
  totalCount: number
  nextCursor?: string
  hasMore: boolean
}

export class DataGridService {
  /**
   * Helper to build the query conditions and main SELECT statement before pagination/limits
   */
  static buildBaseQuery(gridId: string, search: string, filters: Record<string, any>, sortKey?: string, sortDir: 'asc' | 'desc' = 'desc', cursor?: string) {
    const conditions: any[] = []
    const queryStr = search.trim().toLowerCase()

    if (gridId === 'purchases') {
      conditions.push(eq(transactions.transactionType, 'PURCHASE'))
      conditions.push(isNull(transactions.deletedAt))
      if (queryStr) {
        conditions.push(
          or(
            like(transactions.transactionNumber, `%${queryStr}%`),
            like(transactions.referenceNumber, `%${queryStr}%`),
            like(transactions.notes, `%${queryStr}%`),
            like(transactions.transactionDate, `%${queryStr}%`),
            sql`LOWER(${suppliers.companyName}) LIKE ${`%${queryStr}%`}`,
            sql`LOWER(${drivers.name}) LIKE ${`%${queryStr}%`}`
          )
        )
      }
      
      if (cursor && (!sortKey || sortKey === 'transactionDate') && sortDir === 'desc') {
        const [cDate, cCreatedAt, cId] = cursor.split('_')
        if (cDate && cCreatedAt && cId) {
          conditions.push(
            sql`(${transactions.transactionDate}, ${transactions.createdAt}, ${transactions.id}) < (${cDate}, ${cCreatedAt}, ${cId})`
          )
        }
      }

      const rowsQuery = db
        .select({
          id: transactions.id,
          transactionNumber: transactions.transactionNumber,
          transactionType: transactions.transactionType,
          transactionDate: transactions.transactionDate,
          quantity: transactions.quantity,
          unitCost: transactions.unitCost,
          sellingRate: transactions.sellingRate,
          referenceNumber: transactions.referenceNumber,
          vehicleNumber: transactions.referenceNumber,
          notes: transactions.notes,
          createdAt: transactions.createdAt,
          sourceId: transactions.sourceId,
          destinationId: transactions.destinationId,
          supplierName: suppliers.companyName,
          driverName: drivers.name,
        })
        .from(transactions)
        .leftJoin(suppliers, eq(transactions.sourceId, suppliers.id))
        .leftJoin(drivers, eq(transactions.destinationId, drivers.id))
        .where(and(...conditions))

      // Sorting
      if (sortKey === 'transactionNumber') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.transactionNumber) : desc(transactions.transactionNumber))
      } else if (sortKey === 'quantity') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.quantity) : desc(transactions.quantity))
      } else if (sortKey === 'unitCost') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.unitCost) : desc(transactions.unitCost))
      } else {
        rowsQuery.orderBy(
          sortDir === 'asc' ? asc(transactions.transactionDate) : desc(transactions.transactionDate),
          sortDir === 'asc' ? asc(transactions.createdAt) : desc(transactions.createdAt),
          sortDir === 'asc' ? asc(transactions.id) : desc(transactions.id)
        )
      }

      return { rowsQuery, countQuery: db.select({ value: count() }).from(transactions).leftJoin(suppliers, eq(transactions.sourceId, suppliers.id)).leftJoin(drivers, eq(transactions.destinationId, drivers.id)).where(and(...conditions)) }
    }

    if (gridId === 'sales') {
      conditions.push(eq(transactions.transactionType, 'SALE'))
      conditions.push(isNull(transactions.deletedAt))
      if (queryStr) {
        conditions.push(
          or(
            like(transactions.transactionNumber, `%${queryStr}%`),
            like(transactions.referenceNumber, `%${queryStr}%`),
            like(transactions.notes, `%${queryStr}%`),
            like(transactions.transactionDate, `%${queryStr}%`),
            sql`LOWER(${customers.companyName}) LIKE ${`%${queryStr}%`}`,
            sql`LOWER(${drivers.name}) LIKE ${`%${queryStr}%`}`
          )
        )
      }

      if (cursor && (!sortKey || sortKey === 'transactionDate') && sortDir === 'desc') {
        const [cDate, cCreatedAt, cId] = cursor.split('_')
        if (cDate && cCreatedAt && cId) {
          conditions.push(
            sql`(${transactions.transactionDate}, ${transactions.createdAt}, ${transactions.id}) < (${cDate}, ${cCreatedAt}, ${cId})`
          )
        }
      }

      const rowsQuery = db
        .select({
          id: transactions.id,
          transactionNumber: transactions.transactionNumber,
          transactionType: transactions.transactionType,
          transactionDate: transactions.transactionDate,
          quantity: transactions.quantity,
          unitCost: transactions.unitCost,
          sellingRate: transactions.sellingRate,
          averageCostSnapshot: transactions.averageCostSnapshot,
          profitSnapshot: transactions.profitSnapshot,
          referenceNumber: transactions.referenceNumber,
          vehicleNumber: transactions.referenceNumber,
          notes: transactions.notes,
          createdAt: transactions.createdAt,
          sourceId: transactions.sourceId,
          destinationId: transactions.destinationId,
          customerName: customers.companyName,
          driverName: drivers.name,
        })
        .from(transactions)
        .leftJoin(customers, eq(transactions.destinationId, customers.id))
        .leftJoin(drivers, eq(transactions.sourceId, drivers.id))
        .where(and(...conditions))

      if (sortKey === 'transactionNumber') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.transactionNumber) : desc(transactions.transactionNumber))
      } else if (sortKey === 'quantity') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.quantity) : desc(transactions.quantity))
      } else if (sortKey === 'sellingRate') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.sellingRate) : desc(transactions.sellingRate))
      } else {
        rowsQuery.orderBy(
          sortDir === 'asc' ? asc(transactions.transactionDate) : desc(transactions.transactionDate),
          sortDir === 'asc' ? asc(transactions.createdAt) : desc(transactions.createdAt),
          sortDir === 'asc' ? asc(transactions.id) : desc(transactions.id)
        )
      }

      return { rowsQuery, countQuery: db.select({ value: count() }).from(transactions).leftJoin(customers, eq(transactions.destinationId, customers.id)).leftJoin(drivers, eq(transactions.sourceId, drivers.id)).where(and(...conditions)) }
    }

    if (gridId === 'transfers') {
      conditions.push(eq(transactions.transactionType, 'TRANSFER'))
      conditions.push(isNull(transactions.deletedAt))
      
      if (queryStr) {
        conditions.push(
          or(
            like(transactions.transactionNumber, `%${queryStr}%`),
            like(transactions.notes, `%${queryStr}%`),
            like(transactions.transactionDate, `%${queryStr}%`),
            sql`LOWER((SELECT name FROM drivers WHERE id = ${transactions.sourceId})) LIKE ${`%${queryStr}%`}`,
            sql`LOWER((SELECT name FROM drivers WHERE id = ${transactions.destinationId})) LIKE ${`%${queryStr}%`}`
          )
        )
      }

      if (cursor && (!sortKey || sortKey === 'transactionDate') && sortDir === 'desc') {
        const [cDate, cCreatedAt, cId] = cursor.split('_')
        if (cDate && cCreatedAt && cId) {
          conditions.push(
            sql`(${transactions.transactionDate}, ${transactions.createdAt}, ${transactions.id}) < (${cDate}, ${cCreatedAt}, ${cId})`
          )
        }
      }

      const rowsQuery = db
        .select({
          id: transactions.id,
          transactionNumber: transactions.transactionNumber,
          transactionType: transactions.transactionType,
          transactionDate: transactions.transactionDate,
          quantity: transactions.quantity,
          notes: transactions.notes,
          createdAt: transactions.createdAt,
          sourceId: transactions.sourceId,
          destinationId: transactions.destinationId,
          fromDriverName: sql<string>`(SELECT name FROM drivers WHERE id = ${transactions.sourceId})`,
          toDriverName: sql<string>`(SELECT name FROM drivers WHERE id = ${transactions.destinationId})`,
        })
        .from(transactions)
        .where(and(...conditions))

      if (sortKey === 'transactionNumber') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.transactionNumber) : desc(transactions.transactionNumber))
      } else if (sortKey === 'quantity') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(transactions.quantity) : desc(transactions.quantity))
      } else {
        rowsQuery.orderBy(
          sortDir === 'asc' ? asc(transactions.transactionDate) : desc(transactions.transactionDate),
          sortDir === 'asc' ? asc(transactions.createdAt) : desc(transactions.createdAt),
          sortDir === 'asc' ? asc(transactions.id) : desc(transactions.id)
        )
      }

      return { rowsQuery, countQuery: db.select({ value: count() }).from(transactions).where(and(...conditions)) }
    }

    if (gridId === 'drivers') {
      conditions.push(isNull(drivers.deletedAt))
      if (queryStr) {
        conditions.push(
          or(
            like(drivers.name, `%${queryStr}%`),
            like(drivers.phone, `%${queryStr}%`),
            like(drivers.address, `%${queryStr}%`),
            like(drivers.notes, `%${queryStr}%`),
            like(drivers.status, `%${queryStr}%`)
          )
        )
      }

      const rowsQuery = db
        .select({
          id: drivers.id,
          name: drivers.name,
          phone: drivers.phone,
          address: drivers.address,
          status: drivers.status,
          notes: drivers.notes,
          createdAt: drivers.createdAt,
        })
        .from(drivers)
        .where(and(...conditions))

      if (sortKey === 'name') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(drivers.name) : desc(drivers.name))
      } else {
        rowsQuery.orderBy(desc(drivers.createdAt))
      }

      return { rowsQuery, countQuery: db.select({ value: count() }).from(drivers).where(and(...conditions)) }
    }

    if (gridId === 'customers') {
      conditions.push(isNull(customers.deletedAt))
      if (queryStr) {
        conditions.push(
          or(
            like(customers.companyName, `%${queryStr}%`),
            like(customers.contactPerson, `%${queryStr}%`),
            like(customers.phone, `%${queryStr}%`),
            like(customers.address, `%${queryStr}%`),
            like(customers.notes, `%${queryStr}%`)
          )
        )
      }

      const rowsQuery = db
        .select({
          id: customers.id,
          companyName: customers.companyName,
          contactPerson: customers.contactPerson,
          phone: customers.phone,
          address: customers.address,
          notes: customers.notes,
          createdAt: customers.createdAt,
        })
        .from(customers)
        .where(and(...conditions))

      if (sortKey === 'companyName') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(customers.companyName) : desc(customers.companyName))
      } else {
        rowsQuery.orderBy(desc(customers.createdAt))
      }

      return { rowsQuery, countQuery: db.select({ value: count() }).from(customers).where(and(...conditions)) }
    }

    if (gridId === 'suppliers') {
      conditions.push(isNull(suppliers.deletedAt))
      if (queryStr) {
        conditions.push(
          or(
            like(suppliers.companyName, `%${queryStr}%`),
            like(suppliers.contactPerson, `%${queryStr}%`),
            like(suppliers.phone, `%${queryStr}%`),
            like(suppliers.address, `%${queryStr}%`),
            like(suppliers.notes, `%${queryStr}%`)
          )
        )
      }

      const rowsQuery = db
        .select({
          id: suppliers.id,
          companyName: suppliers.companyName,
          contactPerson: suppliers.contactPerson,
          phone: suppliers.phone,
          address: suppliers.address,
          notes: suppliers.notes,
          createdAt: suppliers.createdAt,
        })
        .from(suppliers)
        .where(and(...conditions))

      if (sortKey === 'companyName') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(suppliers.companyName) : desc(suppliers.companyName))
      } else {
        rowsQuery.orderBy(desc(suppliers.createdAt))
      }

      return { rowsQuery, countQuery: db.select({ value: count() }).from(suppliers).where(and(...conditions)) }
    }

    if (gridId === 'inventory') {
      if (queryStr) {
        conditions.push(
          or(
            like(inventory.item, `%${queryStr}%`),
            sql`LOWER((SELECT name FROM drivers WHERE id = ${inventory.item})) LIKE ${`%${queryStr}%`}`
          )
        )
      }

      const rowsQuery = db
        .select({
          item: inventory.item,
          currentStock: inventory.currentStock,
          weightedAverageCost: inventory.weightedAverageCost,
          lastTransactionId: inventory.lastTransactionId,
          updatedAt: inventory.updatedAt,
          driverName: sql<string>`(SELECT name FROM drivers WHERE id = ${inventory.item})`,
        })
        .from(inventory)
        .where(and(...conditions))

      if (sortKey === 'currentStock') {
        rowsQuery.orderBy(sortDir === 'asc' ? asc(inventory.currentStock) : desc(inventory.currentStock))
      } else {
        rowsQuery.orderBy(desc(inventory.updatedAt))
      }

      return { rowsQuery, countQuery: db.select({ value: count() }).from(inventory).where(and(...conditions)) }
    }

    if (gridId === 'audit') {
      if (filters.entityName) {
        conditions.push(eq(auditLogs.entityName, filters.entityName))
      }
      if (queryStr) {
        conditions.push(
          or(
            like(auditLogs.entityName, `%${queryStr}%`),
            like(auditLogs.entityId, `%${queryStr}%`),
            like(auditLogs.action, `%${queryStr}%`),
            like(auditLogs.user, `%${queryStr}%`)
          )
        )
      }

      const rowsQuery = db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.timestamp))

      return { rowsQuery, countQuery: db.select({ value: count() }).from(auditLogs).where(and(...conditions)) }
    }

    throw new Error(`Unsupported grid ID: ${gridId}`)
  }

  static async fetchPage(payload: GridQueryPayload): Promise<GridResponse> {
    const { gridId, page = 1, pageSize = 100, search = '', sortKey, sortDir = 'desc', filters = {}, cursor } = payload
    const limitVal = pageSize
    const offsetVal = (page - 1) * pageSize

    const { rowsQuery, countQuery } = this.buildBaseQuery(gridId, search, filters, sortKey, sortDir, cursor)

    // Run total count query
    const [countResult] = await countQuery

    // Apply limits
    if (cursor && (gridId === 'purchases' || gridId === 'sales' || gridId === 'transfers') && (!sortKey || sortKey === 'transactionDate') && sortDir === 'desc') {
      rowsQuery.limit(limitVal)
    } else {
      rowsQuery.limit(limitVal).offset(offsetVal)
    }

    const rows = await rowsQuery

    // Generate next keyset cursor
    let nextCursor: string | undefined = undefined
    if (rows.length > 0 && (gridId === 'purchases' || gridId === 'sales' || gridId === 'transfers')) {
      const lastRow = rows[rows.length - 1] as any
      nextCursor = `${lastRow.transactionDate}_${lastRow.createdAt}_${lastRow.id}`
    }

    return {
      rows,
      totalCount: countResult.value,
      nextCursor,
      hasMore: rows.length === limitVal,
    }
  }

  /**
   * Generates a raw SQLite statement object from drizzle query
   */
  static getSQLQuery(gridId: string, search: string, filters: Record<string, any>, sortKey?: string, sortDir: 'asc' | 'desc' = 'desc') {
    const { rowsQuery } = this.buildBaseQuery(gridId, search, filters, sortKey, sortDir)
    return rowsQuery.toSQL()
  }
}
