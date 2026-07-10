import { create } from 'zustand'
import { Transaction, Supplier, Inventory, Driver, Customer } from '@/database/repositories/interfaces'
import type { EditDeleteResult } from '@/database/services/TransactionService'

// --- 1. UI Store ---
export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export interface DialogConfig {
  title: string
  message: string
  type: 'confirm' | 'delete' | 'warning' | 'info' | 'success'
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void
}

interface UiState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toasts: Toast[]
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
  dialog: DialogConfig | null
  showDialog: (config: DialogConfig) => void
  closeDialog: () => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  activeLookupId: string | null
  setActiveLookupId: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    let cleanedMessage = message
    if (type === 'error' && typeof message === 'string') {
      const invokePrefix = /Error invoking remote method '[^']+':\s*(.*)/i
      const match = message.match(invokePrefix)
      if (match && match[1]) {
        cleanedMessage = match[1]
      }
      const errorNamePrefix = /^([a-zA-Z0-9_]+Error):\s*(.*)/i
      const matchError = cleanedMessage.match(errorNamePrefix)
      if (matchError && matchError[2]) {
        cleanedMessage = matchError[2]
      }
      if (cleanedMessage.startsWith('Error: ')) {
        cleanedMessage = cleanedMessage.substring(7)
      }
    }
    set((state) => ({
      toasts: [...state.toasts, { id, message: cleanedMessage, type }],
    }))
    // Auto-remove toast after 4 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, 4000)
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  dialog: null,
  showDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  activeLookupId: null,
  setActiveLookupId: (activeLookupId) => set({ activeLookupId }),
}))

// --- 2. Application Store ---
interface AppState {
  currentOperator: string | null
  setOperator: (operator: string | null) => void
  dbConnected: boolean
  setDbConnected: (connected: boolean) => void

  purchases: Transaction[]
  suppliers: Supplier[]
  inventorySnapshots: Inventory[]
  loadingPurchases: boolean

  drivers: Driver[]
  loadingDrivers: boolean

  customers: Customer[]
  sales: Transaction[]
  loadingCustomers: boolean
  
  fetchPurchases: () => Promise<void>
  fetchSuppliers: () => Promise<void>
  fetchInventorySnapshots: () => Promise<void>
  fetchDrivers: () => Promise<void>
  fetchCustomers: () => Promise<void>
  fetchSales: () => Promise<void>

  createDriver: (data: Omit<Driver, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => Promise<Driver>
  updateDriver: (id: string, data: Partial<Omit<Driver, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>) => Promise<Driver>
  deleteDriver: (id: string) => Promise<boolean>

  createCustomer: (data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => Promise<Customer>
  updateCustomer: (id: string, data: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>) => Promise<Customer>
  deleteCustomer: (id: string) => Promise<boolean>

  createSupplier: (data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => Promise<Supplier>
  updateSupplier: (id: string, data: Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>) => Promise<Supplier>
  deleteSupplier: (id: string) => Promise<boolean>
  
  createPurchase: (data: {
    supplierId: string
    destinationLocation: string
    quantity: number
    unitCost: number // in cents
    referenceNumber?: string
    transactionDate: string
    notes?: string
  }) => Promise<Transaction>

  updatePurchase: (id: string, data: {
    supplierId: string
    destinationLocation: string
    quantity: number
    unitCost: number
    referenceNumber?: string
    transactionDate: string
    notes?: string
  }, overrideValidation?: boolean) => Promise<EditDeleteResult<Transaction>>

  deletePurchase: (id: string, overrideValidation?: boolean) => Promise<EditDeleteResult<boolean>>

  createTransfer: (data: {
    fromDriverId: string
    toDriverId: string
    quantity: number
    vehicleNumber?: string
    transactionDate: string
    notes?: string
  }) => Promise<Transaction>

  updateTransfer: (id: string, data: {
    fromDriverId: string
    toDriverId: string
    quantity: number
    vehicleNumber?: string
    transactionDate: string
    notes?: string
  }, overrideValidation?: boolean) => Promise<EditDeleteResult<Transaction>>

  deleteTransfer: (id: string, overrideValidation?: boolean) => Promise<EditDeleteResult<boolean>>
  getDriverStatementReport: (driverId: string, filters?: { startDate?: string; endDate?: string }) => Promise<{
    driverName: string
    assignedVehiclePlate: string | null
    startDate: string | null
    endDate: string | null
    openingBalance: number
    closingBalance: number
    lines: any[]
  }>

  createSale: (data: {
    driverId: string
    customerId: string
    quantity: number
    sellingRate: number // in cents
    vehicleNumber?: string
    transactionDate: string
    notes?: string
  }) => Promise<Transaction>

  updateSale: (id: string, data: {
    driverId: string
    customerId: string
    quantity: number
    sellingRate: number
    vehicleNumber?: string
    transactionDate: string
    notes?: string
  }, overrideValidation?: boolean) => Promise<EditDeleteResult<Transaction>>

  deleteSale: (id: string, overrideValidation?: boolean) => Promise<EditDeleteResult<boolean>>

  refreshAllTransactionData: () => Promise<void>
  createAdjustment: (data: {
    locationId: string
    locationType: 'DRIVER' | 'INVENTORY' | 'VEHICLE'
    adjustmentType: 'INCREASE' | 'DECREASE'
    quantity: number
    notes: string
    transactionDate: string
  }) => Promise<any>
  
  getCustomerStatementReport: (customerId: string, filters?: { startDate?: string; endDate?: string }) => Promise<{
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
  }>

  getDailySummary: (filters?: any) => Promise<any[]>
  getMonthlySummary: (filters?: any) => Promise<any[]>
  getYearlySummary: (filters?: any) => Promise<any[]>
  getProfitAnalysis: (filters?: any) => Promise<any>
  getInventoryValuation: (filters?: any) => Promise<any[]>
  getTransactionHistory: (filters?: any) => Promise<Transaction[]>
  getExceptionReport: (filters?: any) => Promise<any[]>
  getAuditReport: (filters?: any) => Promise<any[]>
  settings: Record<string, string>
  fetchSettings: () => Promise<void>
  saveSettings: (values: Record<string, string>) => Promise<boolean>
}

export const useAppStore = create<AppState>((set, get) => ({
  currentOperator: 'Haroon Wazir',
  setOperator: (operator) => set({ currentOperator: operator }),
  dbConnected: true,
  setDbConnected: (connected) => set({ dbConnected: connected }),
  settings: {},

  purchases: [],
  suppliers: [],
  inventorySnapshots: [],
  loadingPurchases: false,

  drivers: [],
  loadingDrivers: false,

  customers: [],
  sales: [],
  loadingCustomers: false,

  fetchPurchases: async () => {
    set({ loadingPurchases: true })
    try {
      const all = await window.api.invoke('transactions:list')
      const p = all.filter((t) => t.transactionType === 'PURCHASE')
      set({ purchases: p, dbConnected: true })
    } catch (err) {
      console.error(err)
      set({ dbConnected: false })
    } finally {
      set({ loadingPurchases: false })
    }
  },

  fetchSuppliers: async () => {
    try {
      const s = await window.api.invoke('suppliers:list')
      set({ suppliers: s, dbConnected: true })
    } catch (err) {
      console.error(err)
      set({ dbConnected: false })
    }
  },

  fetchInventorySnapshots: async () => {
    try {
      const i = await window.api.invoke('inventory:listSnapshots')
      set({ inventorySnapshots: i, dbConnected: true })
    } catch (err) {
      console.error(err)
      set({ dbConnected: false })
    }
  },

  fetchDrivers: async () => {
    set({ loadingDrivers: true })
    try {
      const d = await window.api.invoke('drivers:list')
      set({ drivers: d, dbConnected: true })
    } catch (err) {
      console.error(err)
      set({ dbConnected: false })
    } finally {
      set({ loadingDrivers: false })
    }
  },


  fetchCustomers: async () => {
    set({ loadingCustomers: true })
    try {
      const c = await window.api.invoke('customers:list')
      set({ customers: c, dbConnected: true })
    } catch (err) {
      console.error(err)
      set({ dbConnected: false })
    } finally {
      set({ loadingCustomers: false })
    }
  },

  fetchSales: async () => {
    try {
      const all = await window.api.invoke('transactions:list')
      const s = all
        .filter((t) => t.transactionType === 'SALE')
        .map((t) => ({
          ...t,
          vehicleNumber: t.referenceNumber || undefined,
        }))
      set({ sales: s, dbConnected: true })
    } catch (err) {
      console.error(err)
      set({ dbConnected: false })
    }
  },

  createDriver: async (data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('drivers:create', data, operator)
    await get().fetchDrivers()
    return res
  },

  updateDriver: async (id, data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('drivers:update', id, data, operator)
    await get().fetchDrivers()
    return res
  },

  deleteDriver: async (id) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('drivers:delete', id, operator)
    await get().fetchDrivers()
    return res
  },



  createCustomer: async (data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('customers:create', data, operator)
    await get().fetchCustomers()
    return res
  },

  updateCustomer: async (id, data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('customers:update', id, data, operator)
    await get().fetchCustomers()
    return res
  },

  deleteCustomer: async (id) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('customers:delete', id, operator)
    await get().fetchCustomers()
    return res
  },

  createSupplier: async (data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('suppliers:create', data, operator)
    await get().fetchSuppliers()
    return res
  },

  updateSupplier: async (id, data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('suppliers:update', id, data, operator)
    await get().fetchSuppliers()
    return res
  },

  deleteSupplier: async (id) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('suppliers:delete', id, operator)
    await get().fetchSuppliers()
    return res
  },

  createPurchase: async (data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:createPurchase', data, operator)
    await get().fetchPurchases()
    await get().fetchInventorySnapshots()
    return res
  },

  refreshAllTransactionData: async () => {
    await Promise.all([
      get().fetchPurchases(),
      get().fetchSales(),
      get().fetchInventorySnapshots(),
    ])
  },

  updatePurchase: async (id, data, overrideValidation?) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:updatePurchase', id, data, operator, overrideValidation)
    if (res.success) await get().refreshAllTransactionData()
    return res
  },

  deletePurchase: async (id, overrideValidation?) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:deleteTransaction', id, operator, overrideValidation)
    if (res.success) await get().refreshAllTransactionData()
    return res
  },

  createTransfer: async (data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:createTransfer', data, operator)
    await get().fetchInventorySnapshots()
    return res
  },

  updateTransfer: async (id, data, overrideValidation?) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:updateTransfer', id, data, operator, overrideValidation)
    if (res.success) await get().refreshAllTransactionData()
    return res
  },

  deleteTransfer: async (id, overrideValidation?) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:deleteTransaction', id, operator, overrideValidation)
    if (res.success) await get().refreshAllTransactionData()
    return res
  },

  getDriverStatementReport: async (driverId, filters) => {
    return window.api.invoke('drivers:getStatementReport', driverId, filters)
  },

  createSale: async (data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:createSale', data, operator)
    await get().fetchSales()
    await get().fetchInventorySnapshots()
    return { ...res, vehicleNumber: res.referenceNumber || undefined }
  },

  updateSale: async (id, data, overrideValidation?) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:updateSale', id, data, operator, overrideValidation)
    if (res.success) await get().refreshAllTransactionData()
    return res
  },

  deleteSale: async (id, overrideValidation?) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:deleteTransaction', id, operator, overrideValidation)
    if (res.success) await get().refreshAllTransactionData()
    return res
  },

  createAdjustment: async (data) => {
    const operator = get().currentOperator || 'Haroon Wazir'
    const res = await window.api.invoke('transactions:createAdjustment', data, operator)
    await get().fetchInventorySnapshots()
    return res
  },

  getCustomerStatementReport: async (customerId, filters) => {
    return window.api.invoke('customers:getStatementReport', customerId, filters)
  },

  getDailySummary: async (filters) => window.api.invoke('reports:getDailySummary', filters),
  getMonthlySummary: async (filters) => window.api.invoke('reports:getMonthlySummary', filters),
  getYearlySummary: async (filters) => window.api.invoke('reports:getYearlySummary', filters),
  getProfitAnalysis: async (filters) => window.api.invoke('reports:getProfitAnalysis', filters),
  getInventoryValuation: async (filters) => window.api.invoke('reports:getInventoryValuation', filters),
  getTransactionHistory: async (filters) => window.api.invoke('reports:getTransactionHistory', filters),
  getExceptionReport: async (filters) => window.api.invoke('reports:getExceptionReport', filters),
  getAuditReport: async (filters) => window.api.invoke('reports:getAuditReport', filters),

  fetchSettings: async () => {
    try {
      const s = await window.api.invoke('settings:get')
      set({ settings: s })
      if (s.company_name) {
        // Can configure additional operators/states here if needed
      }
      if (s.operator_name) {
        set({ currentOperator: s.operator_name })
      }
    } catch (e) {
      console.error(e)
    }
  },

  saveSettings: async (values) => {
    const operator = get().currentOperator || 'System Operator'
    try {
      const ok = await window.api.invoke('settings:save', values, operator)
      if (ok) {
        await get().fetchSettings()
      }
      return ok
    } catch (e) {
      console.error(e)
      return false
    }
  },
}))

// --- 3. Filter Store ---
interface DateRange {
  start: string | null // ISO Date string (YYYY-MM-DD)
  end: string | null
}

interface FilterState {
  globalSearch: string
  setGlobalSearch: (search: string) => void
  dateRange: DateRange
  setDateRange: (range: Partial<DateRange>) => void
  selectedDriverId: string | null
  setSelectedDriverId: (id: string | null) => void
  selectedCustomerId: string | null
  setSelectedCustomerId: (id: string | null) => void
  resetFilters: () => void
}

export const useFilterStore = create<FilterState>((set) => ({
  globalSearch: '',
  setGlobalSearch: (globalSearch) => set({ globalSearch }),
  dateRange: { start: null, end: null },
  setDateRange: (range) =>
    set((state) => ({ dateRange: { ...state.dateRange, ...range } })),
  selectedDriverId: null,
  setSelectedDriverId: (selectedDriverId) => set({ selectedDriverId }),
  selectedCustomerId: null,
  setSelectedCustomerId: (selectedCustomerId) => set({ selectedCustomerId }),
  resetFilters: () =>
    set({
      globalSearch: '',
      dateRange: { start: null, end: null },
      selectedDriverId: null,
      selectedCustomerId: null,
    }),
}))
