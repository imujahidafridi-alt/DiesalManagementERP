import { CustomerRepository } from '../repositories/CustomerRepository'
import { TransactionRepository } from '../repositories/TransactionRepository'
import { Customer } from '../repositories/interfaces'
import { AuditService } from './AuditService'
import { db } from '../db'
import { drivers } from '../schema/schema'

const customerRepo = new CustomerRepository()
const txRepo = new TransactionRepository()

export interface CustomerStatement {
  totalPurchased: number // in liters
  totalInvoiced: number // in cents
  totalPaid: number // in cents
  currentBalance: number // in cents (totalInvoiced - totalPaid)
}

export class CustomerService {
  /**
   * Derive a customer's statement dynamically from transactions
   * Inflow: SALE transactions where destinationId = customerId
   * Outflow (Payment/Credit): RETURN or ADJUSTMENT transactions where sourceId = customerId
   */
  static async getCustomerStatement(customerId: string): Promise<CustomerStatement> {
    const txs = await txRepo.listByEntity(customerId)
    
    let totalPurchased = 0
    let totalInvoiced = 0
    let totalPaid = 0

    for (const tx of txs) {
      if (tx.destinationId === customerId) {
        if (tx.transactionType === 'SALE') {
          totalPurchased += tx.quantity
          totalInvoiced += Math.round(tx.quantity * tx.sellingRate)
        }
      } else if (tx.sourceId === customerId) {
        if (tx.transactionType === 'RETURN') {
          totalPurchased -= tx.quantity
          totalPaid += Math.round(tx.quantity * tx.sellingRate)
        } else if (tx.transactionType === 'ADJUSTMENT') {
          totalPaid += Math.round(tx.quantity * tx.sellingRate)
        }
      }
    }

    const currentBalance = totalInvoiced - totalPaid

    return {
      totalPurchased,
      totalInvoiced,
      totalPaid,
      currentBalance,
    }
  }

  static async createCustomer(data: Parameters<CustomerRepository['create']>[0], user: string): Promise<Customer> {
    const record = await customerRepo.create(data)
    await AuditService.log('customers', record.id, 'CREATE', null, record, user)
    return record
  }

  static async updateCustomer(id: string, data: Parameters<CustomerRepository['update']>[1], user: string): Promise<Customer> {
    const prior = await customerRepo.getById(id)
    const updated = await customerRepo.update(id, data)
    await AuditService.log('customers', id, 'UPDATE', prior, updated, user)
    return updated
  }

  static async deleteCustomer(id: string, user: string): Promise<boolean> {
    const prior = await customerRepo.getById(id)
    await customerRepo.delete(id)
    await AuditService.log('customers', id, 'DELETE', prior, { ...prior, deletedAt: new Date().toISOString() }, user)
    return true
  }

  static async list(): Promise<Customer[]> {
    return customerRepo.list()
  }

  static async getById(id: string): Promise<Customer | null> {
    return customerRepo.getById(id)
  }

  /**
   * Generates a detailed running statement report for customer ledger audits.
   */
  static async getCustomerStatementReport(
    customerId: string,
    filters?: { startDate?: string; endDate?: string }
  ): Promise<{
    customerName: string
    companyName: string
    startDate: string | null
    endDate: string | null
    openingBalance: number
    closingBalance: number
    lines: any[]
    summary: {
      lifetimeVolume: number
      lifetimeAmount: number
      averagePrice: number
      lastPurchaseDate: string | null
    }
  }> {
    const customer = await customerRepo.getById(customerId)
    if (!customer) throw new Error(`Customer not found: ${customerId}`)

    const txs = await txRepo.listByEntity(customerId)
    const chronologicalTxs = [...txs].reverse()

    const lines: any[] = []
    let runningVolume = 0
    let runningBalance = 0 // in cents

    // Fetch drivers list for mapping
    const allDrivers = await db.select().from(drivers)

    const getDriverName = (driverId: string) => {
      const d = allDrivers.find((drv) => drv.id === driverId)
      return d ? d.name : 'Unknown Driver'
    }

    let openingBalance = 0
    const start = filters?.startDate || null
    const end = filters?.endDate || null

    let lifetimeVolume = 0
    let lifetimeAmount = 0
    let lastPurchaseDate: string | null = null

    for (const tx of chronologicalTxs) {
      const isSale = tx.destinationId === customerId && tx.transactionType === 'SALE'
      const isReturn = tx.sourceId === customerId && tx.transactionType === 'RETURN'

      let volumeDelta = 0
      let amountDelta = 0

      if (isSale) {
        volumeDelta = tx.quantity
        amountDelta = Math.round(tx.quantity * tx.sellingRate)
        
        lifetimeVolume += tx.quantity
        lifetimeAmount += amountDelta
        lastPurchaseDate = tx.transactionDate
      } else if (isReturn) {
        volumeDelta = -tx.quantity
        amountDelta = -Math.round(tx.quantity * tx.sellingRate)
      }

      runningVolume += volumeDelta
      runningBalance += amountDelta

      const txDate = tx.transactionDate

      // If before start date, update openingBalance
      if (start && txDate < start) {
        openingBalance = runningBalance
        continue
      }

      // If after end date, exclude from statement rows
      if (end && txDate > end) {
        continue
      }

      lines.push({
        id: tx.id,
        transactionNumber: tx.transactionNumber,
        transactionDate: tx.transactionDate,
        transactionType: tx.transactionType,
        driverName: getDriverName(tx.sourceId),
        quantity: tx.quantity,
        sellingRate: tx.sellingRate,
        totalAmount: Math.round(tx.quantity * tx.sellingRate),
        referenceNumber: tx.referenceNumber,
        notes: tx.notes,
        runningVolume: runningVolume,
        runningBalance: runningBalance,
      })
    }

    const closingBalance = runningBalance
    const averagePrice = lifetimeVolume > 0 ? Math.round(lifetimeAmount / lifetimeVolume) : 0

    return {
      customerName: customer.contactPerson || customer.companyName,
      companyName: customer.companyName,
      startDate: start,
      endDate: end,
      openingBalance,
      closingBalance,
      lines: lines.reverse(), // desc chronological list
      summary: {
        lifetimeVolume,
        lifetimeAmount,
        averagePrice,
        lastPurchaseDate,
      },
    }
  }
}
