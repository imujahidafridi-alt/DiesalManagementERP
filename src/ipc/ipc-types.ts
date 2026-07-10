import {
  Driver,
  Customer,
  Supplier,
  Transaction,
  Inventory,
  AuditLog,
} from '../database/repositories/interfaces'
import { DriverStatement } from '../database/services/DriverService'
import { CustomerStatement } from '../database/services/CustomerService'
import type { EditDeleteResult } from '../database/services/TransactionService'
import { SupplierStatement } from '../database/services/SupplierService'

// Service-aligned typed IPC boundary contract mapping.
export interface IpcChannelMap {
  // Drivers
  'drivers:list': { args: []; return: Driver[] }
  'drivers:getById': { args: [id: string]; return: Driver | null }
  'drivers:create': { args: [data: Omit<Driver, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>, user: string]; return: Driver }
  'drivers:update': { args: [id: string, data: Partial<Omit<Driver, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>, user: string]; return: Driver }
  'drivers:delete': { args: [id: string, user: string]; return: boolean }
  'drivers:getStatement': { args: [driverId: string]; return: DriverStatement }
  'drivers:calculateDriverBalance': { args: [driverId: string, upToDate?: string]; return: number }
  'drivers:getStatementReport': {
    args: [
      driverId: string,
      filters?: { startDate?: string; endDate?: string }
    ]
    return: {
      driverName: string
      assignedVehiclePlate: string | null
      startDate: string | null
      endDate: string | null
      openingBalance: number
      closingBalance: number
      lines: any[]
    }
  }

  // Customers
  'customers:list': { args: []; return: Customer[] }
  'customers:getById': { args: [id: string]; return: Customer | null }
  'customers:create': { args: [data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>, user: string]; return: Customer }
  'customers:update': { args: [id: string, data: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>, user: string]; return: Customer }
  'customers:delete': { args: [id: string, user: string]; return: boolean }
  'customers:getStatement': { args: [customerId: string]; return: CustomerStatement }
  'customers:getStatementReport': {
    args: [
      customerId: string,
      filters?: { startDate?: string; endDate?: string }
    ]
    return: {
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
    }
  }

  // Suppliers
  'suppliers:list': { args: []; return: Supplier[] }
  'suppliers:getById': { args: [id: string]; return: Supplier | null }
  'suppliers:create': { args: [data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>, user: string]; return: Supplier }
  'suppliers:update': { args: [id: string, data: Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>, user: string]; return: Supplier }
  'suppliers:delete': { args: [id: string, user: string]; return: boolean }
  'suppliers:getStatement': { args: [supplierId: string]; return: SupplierStatement }

  // Transactions
  'transactions:list': { args: []; return: Transaction[] }
  'transactions:getById': { args: [id: string]; return: Transaction | null }
  'transactions:createPurchase': {
    args: [
      data: {
        supplierId: string
        destinationLocation: string
        quantity: number
        unitCost: number
        referenceNumber?: string
        transactionDate: string
        notes?: string
      },
      user: string,
    ]
    return: Transaction
  }
  'transactions:createSale': {
    args: [
      data: {
        driverId: string
        customerId: string
        quantity: number
        sellingRate: number
        vehicleNumber?: string
        transactionDate: string
        notes?: string
      },
      user: string,
    ]
    return: Transaction
  }
  'transactions:updateSale': {
    args: [
      id: string,
      data: {
        driverId: string
        customerId: string
        quantity: number
        sellingRate: number
        vehicleNumber?: string
        transactionDate: string
        notes?: string
      },
      user: string,
      overrideValidation?: boolean,
    ]
    return: EditDeleteResult<Transaction>
  }
  'transactions:createTransfer': {
    args: [
      data: {
        fromDriverId: string
        toDriverId: string
        quantity: number
        vehicleNumber?: string
        transactionDate: string
        notes?: string
      },
      user: string,
    ]
    return: Transaction
  }
  'transactions:updateTransfer': {
    args: [
      id: string,
      data: {
        fromDriverId: string
        toDriverId: string
        quantity: number
        vehicleNumber?: string
        transactionDate: string
        notes?: string
      },
      user: string,
      overrideValidation?: boolean,
    ]
    return: EditDeleteResult<Transaction>
  }
  'transactions:createReturn': {
    args: [
      data: {
        returnType: 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN' | 'DRIVER_RETURN' | 'INVENTORY_RETURN'
        sourceId: string
        destinationId: string
        quantity: number
        costOrRate: number
        referenceNumber?: string
        transactionDate: string
        notes?: string
      },
      user: string,
    ]
    return: Transaction
  }
  'transactions:createAdjustment': {
    args: [
      data: {
        locationId: string
        locationType: 'DRIVER' | 'INVENTORY' | 'VEHICLE'
        adjustmentType: 'INCREASE' | 'DECREASE'
        quantity: number
        notes: string
        transactionDate: string
      },
      user: string,
    ]
    return: Transaction
  }
  'transactions:createOpeningBalance': {
    args: [
      data: {
        locationId: string
        locationType: 'DRIVER' | 'INVENTORY' | 'VEHICLE'
        quantity: number
        unitCost: number
        transactionDate: string
        notes?: string
      },
      user: string,
    ]
    return: Transaction
  }
  'transactions:updatePurchase': {
    args: [
      id: string,
      data: {
        supplierId: string
        destinationLocation: string
        quantity: number
        unitCost: number
        referenceNumber?: string
        transactionDate: string
        notes?: string
      },
      user: string,
      overrideValidation?: boolean,
    ]
    return: EditDeleteResult<Transaction>
  }
  'transactions:deleteTransaction': { args: [id: string, user: string, overrideValidation?: boolean]; return: EditDeleteResult<boolean> }
  'transactions:restoreTransaction': { args: [id: string, user: string]; return: boolean }

  // Inventory
  'inventory:listSnapshots': { args: []; return: Inventory[] }
  'inventory:getSnapshot': { args: [item: string]; return: Inventory }
  'inventory:rebuildSnapshot': { args: [item: string]; return: Inventory }
  'inventory:calculateInventory': { args: [item: string, upToDate?: string]; return: number }
  'inventory:calculateWeightedAverageCost': { args: [item: string, upToDate?: string]; return: number }

  // Audit Logs
  'audit:list': { args: [entityName?: string, entityId?: string]; return: AuditLog[] }

  // Reports & Analytics
  'reports:getDailySummary': { args: [filters?: ReportFilters]; return: any[] }
  'reports:getMonthlySummary': { args: [filters?: ReportFilters]; return: any[] }
  'reports:getYearlySummary': { args: [filters?: ReportFilters]; return: any[] }
  'reports:getProfitAnalysis': {
    args: [filters?: ReportFilters]
    return: {
      summary: {
        totalQuantitySold: number
        revenue: number
        cost: number
        grossProfit: number
        averageMargin: number
        profitPerLiter: number
      }
      topCustomers: any[]
      topDrivers: any[]
      bestSellingDays: any[]
      highestRevenueDays: any[]
      highestProfitDays: any[]
    }
  }
  'reports:getInventoryValuation': { args: [filters?: ReportFilters]; return: any[] }
  'reports:getTransactionHistory': { args: [filters?: ReportFilters]; return: Transaction[] }
  'reports:getExceptionReport': { args: [filters?: ReportFilters]; return: any[] }
  'reports:getAuditReport': { args: [filters?: ReportFilters]; return: any[] }
  
  'backup:create': { args: [manualReason?: string, maxCount?: number]; return: string }
  'backup:list': { args: []; return: any[] }
  'backup:restore': { args: [filePath: string]; return: boolean }
  'backup:getFolder': { args: []; return: string }
  'backup:setFolder': { args: [folder: string]; return: void }
  'db:integrityCheck': { args: []; return: { ok: boolean; issues: string[] } }
  'db:optimize': { args: []; return: boolean }
  'settings:get': { args: []; return: Record<string, string> }
  'settings:save': { args: [values: Record<string, string>, user: string]; return: boolean }
  'import:execute': { args: [entityType: string, rows: any[], user: string]; return: { imported: number; skipped: number; failed: number; executionTimeMs: number; errors: string[] } }
  'import:smartExecute': { args: [records: any[], user: string, autoCreateMasters: boolean]; return: { imported: number; errors: string[] } }
  'app:reboot': { args: []; return: void }
  'app:exportDiagnostics': { args: []; return: string }
  'logger:write': { args: [log: { level: 'info' | 'warn' | 'error' | 'critical'; message: string; errorStack?: string }]; return: void }
  'window:minimize': { args: []; return: void }
  'window:maximize': { args: []; return: void }
  'window:close': { args: []; return: void }
}

export interface ReportFilters {
  startDate?: string
  endDate?: string
  driverId?: string
  customerId?: string
  supplierId?: string
  vehicleId?: string
  transactionType?: string
  referenceNumber?: string
  operator?: string
  notes?: string
  minQuantity?: number
  maxQuantity?: number
  minRate?: number
  maxRate?: number
  minAmount?: number
  maxAmount?: number
  minProfit?: number
  maxProfit?: number
}

export type IpcChannel = keyof IpcChannelMap

export interface ElectronAPI {
  invoke<K extends IpcChannel>(
    channel: K,
    ...args: IpcChannelMap[K]['args']
  ): Promise<IpcChannelMap[K]['return']>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
