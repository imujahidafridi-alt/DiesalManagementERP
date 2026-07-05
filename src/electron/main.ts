import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { runMigrations } from '../database/migrator'
import { DriverService } from '../database/services/DriverService'
import { CustomerService } from '../database/services/CustomerService'
import { SupplierService } from '../database/services/SupplierService'
import { TransactionService } from '../database/services/TransactionService'
import { InventoryService } from '../database/services/InventoryService'
import { AuditService } from '../database/services/AuditService'
import { ReportService } from '../database/services/ReportService'
import { BackupService } from '../database/services/BackupService'
import { SettingsService } from '../database/services/SettingsService'
import { ImportService } from '../database/services/ImportService'
import { initMainLogger, Logger } from '../utils/Logger'
import fs from 'fs'

// Set production/dev flags
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
    title: 'Malak Enterprise ERP',
    autoHideMenuBar: true,
  })

  // Load URL in development or HTML file in production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Perform database migrations and run window on ready
app.whenReady().then(() => {
  initMainLogger(app.getPath('userData'))
  Logger.info('Malak Enterprise ERP Starting up...')
  console.log('Initializing database...')
  runMigrations()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- REGISTER IPC HANDLERS ---

// Helper function to register type-safe handlers
function handleIpc<K extends string>(
  channel: K,
  handler: (...args: any[]) => Promise<any>
) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      console.error(`Error in IPC handler for channel "${channel}":`, error)
      throw error
    }
  })
}

// 1. Drivers
handleIpc('drivers:list', async () => DriverService.list())
handleIpc('drivers:getById', async (id: string) => DriverService.getById(id))
handleIpc('drivers:create', async (data, user: string) => DriverService.createDriver(data, user))
handleIpc('drivers:update', async (id: string, data, user: string) => DriverService.updateDriver(id, data, user))
handleIpc('drivers:delete', async (id: string, user: string) => DriverService.deleteDriver(id, user))
handleIpc('drivers:getStatement', async (driverId: string) => DriverService.getDriverStatement(driverId))
handleIpc('drivers:calculateDriverBalance', async (driverId: string, upToDate?: string) => DriverService.calculateDriverBalance(driverId, upToDate))
handleIpc('drivers:getStatementReport', async (driverId: string, filters) => DriverService.getDriverStatementReport(driverId, filters))

// 2. Customers
handleIpc('customers:list', async () => CustomerService.list())
handleIpc('customers:getById', async (id: string) => CustomerService.getById(id))
handleIpc('customers:create', async (data, user: string) => CustomerService.createCustomer(data, user))
handleIpc('customers:update', async (id: string, data, user: string) => CustomerService.updateCustomer(id, data, user))
handleIpc('customers:delete', async (id: string, user: string) => CustomerService.deleteCustomer(id, user))
handleIpc('customers:getStatement', async (customerId: string) => CustomerService.getCustomerStatement(customerId))
handleIpc('customers:getStatementReport', async (customerId: string, filters) => CustomerService.getCustomerStatementReport(customerId, filters))

// 3. Suppliers
handleIpc('suppliers:list', async () => SupplierService.list())
handleIpc('suppliers:getById', async (id: string) => SupplierService.getById(id))
handleIpc('suppliers:create', async (data, user: string) => SupplierService.createSupplier(data, user))
handleIpc('suppliers:update', async (id: string, data, user: string) => SupplierService.updateSupplier(id, data, user))
handleIpc('suppliers:delete', async (id: string, user: string) => SupplierService.deleteSupplier(id, user))
handleIpc('suppliers:getStatement', async (supplierId: string) => SupplierService.getSupplierStatement(supplierId))

// 5. Transactions (atomic actions)
handleIpc('transactions:list', async () => TransactionService.list())
handleIpc('transactions:getById', async (id: string) => TransactionService.getById(id))
handleIpc('transactions:createPurchase', async (data, user: string) => TransactionService.createPurchase(data, user))
handleIpc('transactions:updatePurchase', async (id: string, data, user: string) => TransactionService.updatePurchase(id, data, user))
handleIpc('transactions:createSale', async (data, user: string) => TransactionService.createSale(data, user))
handleIpc('transactions:updateSale', async (id: string, data, user: string) => TransactionService.updateSale(id, data, user))
handleIpc('transactions:createTransfer', async (data, user: string) => TransactionService.createTransfer(data, user))
handleIpc('transactions:updateTransfer', async (id: string, data, user: string) => TransactionService.updateTransfer(id, data, user))
handleIpc('transactions:createReturn', async (data, user: string) => TransactionService.createReturn(data, user))
handleIpc('transactions:createAdjustment', async (data, user: string) => TransactionService.createAdjustment(data, user))
handleIpc('transactions:createOpeningBalance', async (data, user: string) => TransactionService.createOpeningBalance(data, user))
handleIpc('transactions:deleteTransaction', async (id: string, user: string) => TransactionService.deleteTransaction(id, user))
handleIpc('transactions:restoreTransaction', async (id: string, user: string) => TransactionService.restoreTransaction(id, user))

// 6. Inventory Cache
handleIpc('inventory:listSnapshots', async () => InventoryService.listSnapshots())
handleIpc('inventory:getSnapshot', async (item: string) => InventoryService.getSnapshot(item))
handleIpc('inventory:rebuildSnapshot', async (item: string) => InventoryService.rebuildSnapshot(item))
handleIpc('inventory:calculateInventory', async (item: string, upToDate?: string) => InventoryService.calculateInventory(item, upToDate))
handleIpc('inventory:calculateWeightedAverageCost', async (item: string, upToDate?: string) => InventoryService.calculateWeightedAverageCost(item, upToDate))

// 7. Audit Logs
handleIpc('audit:list', async (entityName?: string, entityId?: string) => AuditService.list(entityName, entityId))

// 8. Reports & Analytics
handleIpc('reports:getDailySummary', async (filters) => ReportService.getDailySummaryReport(filters))
handleIpc('reports:getMonthlySummary', async (filters) => ReportService.getMonthlySummaryReport(filters))
handleIpc('reports:getYearlySummary', async (filters) => ReportService.getYearlySummaryReport(filters))
handleIpc('reports:getProfitAnalysis', async (filters) => ReportService.getProfitAnalysis(filters))
handleIpc('reports:getInventoryValuation', async (filters) => ReportService.getInventoryValuation(filters))
handleIpc('reports:getTransactionHistory', async (filters) => ReportService.getTransactionHistory(filters))
handleIpc('reports:getExceptionReport', async (filters) => ReportService.getExceptionReport(filters))
handleIpc('reports:getAuditReport', async (filters) => ReportService.getAuditReport(filters))

// 9. Backups
handleIpc('backup:create', async (manualReason?: string, maxCount?: number) => BackupService.createBackup(manualReason, maxCount))
handleIpc('backup:list', async () => BackupService.listBackups())
handleIpc('backup:restore', async (filePath: string) => BackupService.restoreBackup(filePath))
handleIpc('backup:getFolder', async () => BackupService.getBackupFolder())
handleIpc('backup:setFolder', async (folder: string) => BackupService.setBackupFolder(folder))

// 10. Integrity & Diagnostics
handleIpc('db:integrityCheck', async () => BackupService.checkIntegrity())
handleIpc('db:optimize', async () => BackupService.optimizeDb())

// 11. Application Settings
handleIpc('settings:get', async () => SettingsService.getSettings())
handleIpc('settings:save', async (values: Record<string, string>, user: string) => SettingsService.saveSettings(values, user))

// 12. Data Imports
handleIpc('import:execute', async (entityType: string, rows: any[], user: string) => ImportService.importRecords(entityType, rows, user))

// 13. System Actions
handleIpc('app:reboot', async () => {
  app.relaunch()
  app.exit(0)
})
handleIpc('app:exportDiagnostics', async () => {
  const logFile = Logger.getLogFilePath()
  if (logFile && fs.existsSync(logFile)) {
    return fs.readFileSync(logFile, 'utf8')
  }
  return 'No logs recorded.'
})
handleIpc('logger:write', async (log: { level: 'info' | 'warn' | 'error' | 'critical'; message: string; errorStack?: string }) => {
  const fn = Logger[log.level] || Logger.info
  fn(log.message + (log.errorStack ? `\nStack: ${log.errorStack}` : ''))
})
