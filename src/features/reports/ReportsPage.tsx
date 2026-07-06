import { useState, useEffect, useMemo } from 'react'
import { Button, DataGrid, useShortcutEffect, Select } from '@/components/ui'
import { useUiStore, useAppStore } from '@/store'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import { FormattingService } from '@/utils/FormattingService'
import { PdfService } from '@/utils/PdfService'
import {
  FileSpreadsheet,
  Printer,
  Calendar,
  RefreshCw,
  ChevronRight,
  Database,
  ArrowRightLeft,
  TrendingUp,
  Sliders,
  Save,
  Download,
  AlertOctagon,
  Trash2,
} from 'lucide-react'
import type { GridColumn } from '@/components/ui/DataGrid'

// Report Categories definitions
interface ReportCategory {
  id: string
  name: string
  icon: any
  description: string
}

const categories: ReportCategory[] = [
  { id: 'profit_analysis', name: 'Profit Analysis', icon: TrendingUp, description: 'Revenue, COGS, margins, and top performance metrics.' },
  { id: 'inventory_valuation', name: 'Inventory Valuation', icon: Database, description: 'Current asset values and stock levels per driver.' },
  { id: 'purchase_register', name: 'Purchase Register', icon: ShoppingBagIcon, description: 'Chronological list of all bulk purchase operations.' },
  { id: 'sales_register', name: 'Sales Register', icon: TrendingUp, description: 'Chronological customer sales invoices register.' },
  { id: 'transfer_register', name: 'Transfer Register', icon: ArrowRightLeft, description: 'Internal diesel load-out transfers registry.' },
  { id: 'supplier_ledger', name: 'Supplier Ledger', icon: UsersIcon, description: 'Aggregated purchase volumes and costs per supplier.' },
  { id: 'driver_ledger', name: 'Driver Ledger', icon: TruckIcon, description: 'Opening, inflow, outflow, and closing driver stock reports.' },
  { id: 'customer_ledger', name: 'Customer Ledger', icon: UsersIcon, description: 'Aggregated sales and returns statements per client.' },
  { id: 'stock_movement', name: 'Stock Movement', icon: Database, description: 'Detailed general ledger audit trail of all transactions.' },
  { id: 'returns_register', name: 'Returns Register', icon: ArrowRightLeft, description: 'Supplier, customer, and driver fuel returns.' },
  { id: 'adjustment_register', name: 'Adjustment Register', icon: Sliders, description: 'Manual stock dip measurement corrections.' },
  { id: 'daily_summary', name: 'Daily Summary', icon: Calendar, description: 'Grouped statistics and totals by calendar day.' },
  { id: 'monthly_summary', name: 'Monthly Summary', icon: Calendar, description: 'Grouped statistics and totals by month.' },
  { id: 'yearly_summary', name: 'Yearly Summary', icon: Calendar, description: 'Grouped statistics and totals by fiscal year.' },
  { id: 'audit_trail', name: 'System Audit Trail', icon: Sliders, description: 'Operator actions and detailed database edits history.' },
  { id: 'exceptions', name: 'Exception Audit', icon: AlertOctagon, description: 'Capacity breaches, manual overrides, and zero rate invoices.' },
]

// Icons fallback since we need them
function ShoppingBagIcon(props: any) {
  return <TrendingUp {...props} /> // Fallback using Lucide
}
function UsersIcon(props: any) {
  return <Calendar {...props} /> // Fallback
}
function TruckIcon(props: any) {
  return <Database {...props} /> // Fallback
}

export default function ReportsPage() {
  const { currencySymbol: symbol, quantityAbbreviation: unit } = useBusinessSettings()
  const { addToast } = useUiStore()
  
  // Zustand Store integrations
  const {
    fetchDrivers,
    fetchCustomers,
    fetchSuppliers,
    drivers,
    customers,
    suppliers,
    getDailySummary,
    getMonthlySummary,
    getYearlySummary,
    getProfitAnalysis,
    getInventoryValuation,
    getTransactionHistory,
    getExceptionReport,
    getAuditReport,
  } = useAppStore()

  // Selected Category State
  const [selectedCat, setSelectedCat] = useState<string>('profit_analysis')
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<any[]>([])
  const [profitSummary, setProfitSummary] = useState<any>(null)

  // Filters State
  const [datePreset, setDatePreset] = useState<string>('this_month')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [driverId, setDriverId] = useState<string>('')
  const [customerId, setCustomerId] = useState<string>('')
  const [supplierId, setSupplierId] = useState<string>('')
  const [txType, setTxType] = useState<string>('')
  const [refNum, setRefNum] = useState<string>('')
  const [operator, setOperator] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  
  // Numeric ranges
  const [minQty, setMinQty] = useState<string>('')
  const [maxQty, setMaxQty] = useState<string>('')
  const [minRate, setMinRate] = useState<string>('')
  const [maxRate, setMaxRate] = useState<string>('')
  
  // Column visibility customizations
  const [colPrefs, setColPrefs] = useState<Record<string, boolean>>({})
  const [showColMenu, setShowColMenu] = useState(false)

  // Saved configs list
  const [savedConfigs, setSavedConfigs] = useState<{ name: string; category: string; filters: any }[]>([])
  const [newConfigName, setNewConfigName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)

  // Trigger Date preset changes
  useEffect(() => {
    const today = new Date()
    let start = ''
    let end = today.toISOString().split('T')[0]

    switch (datePreset) {
      case 'today':
        start = end
        break
      case 'yesterday':
        const yest = new Date()
        yest.setDate(today.getDate() - 1)
        start = yest.toISOString().split('T')[0]
        end = start
        break
      case 'last_7_days':
        const l7 = new Date()
        l7.setDate(today.getDate() - 6)
        start = l7.toISOString().split('T')[0]
        break
      case 'this_month':
        start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
        break
      case 'last_month':
        const lm = new Date()
        lm.setMonth(today.getMonth() - 1)
        start = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-01`
        const lastDay = new Date(lm.getFullYear(), lm.getMonth() + 1, 0)
        end = lastDay.toISOString().split('T')[0]
        break
      case 'this_year':
        start = `${today.getFullYear()}-01-01`
        break
      default:
        start = ''
        end = ''
    }

    setStartDate(start)
    setEndDate(end)
  }, [datePreset])

  // Initialize directory helpers on mount
  useEffect(() => {
    Promise.all([
      fetchDrivers(),
      fetchCustomers(),
      fetchSuppliers(),
    ]).catch(console.error)

    // Load saved configurations from localStorage
    const saved = localStorage.getItem('saved_reports_configs')
    if (saved) {
      try {
        setSavedConfigs(JSON.parse(saved))
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  // ----------------------------------------------------
  // Compile Active Filter Object
  // ----------------------------------------------------
  const compiledFilters = useMemo(() => {
    return {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      driverId: driverId || undefined,
      customerId: customerId || undefined,
      supplierId: supplierId || undefined,
      transactionType: txType || undefined,
      referenceNumber: refNum || undefined,
      operator: operator || undefined,
      notes: notes || undefined,
      minQuantity: minQty ? parseFloat(minQty) : undefined,
      maxQuantity: maxQty ? parseFloat(maxQty) : undefined,
      minRate: minRate ? Math.round(parseFloat(minRate) * 100) : undefined,
      maxRate: maxRate ? Math.round(parseFloat(maxRate) * 100) : undefined,
    }
  }, [startDate, endDate, driverId, customerId, supplierId, txType, refNum, operator, notes, minQty, maxQty, minRate, maxRate])

  // ----------------------------------------------------
  // Execute Queries from Report Service
  // ----------------------------------------------------
  const runReport = async (showToast: boolean = false) => {
    setLoading(true)
    try {
      let data: any[] = []
      setProfitSummary(null)

      switch (selectedCat) {
        case 'profit_analysis':
          const stats = await getProfitAnalysis(compiledFilters)
          setProfitSummary(stats.summary)
          data = stats.topCustomers.map((c: any, i: number) => ({
            rank: i + 1,
            entity: c.companyName,
            type: 'Customer',
            quantity: c.quantity,
            revenue: c.revenue,
            profit: c.profit,
          }))
          break
        case 'inventory_valuation':
          data = await getInventoryValuation(compiledFilters)
          break
        case 'daily_summary':
          data = await getDailySummary(compiledFilters)
          break
        case 'monthly_summary':
          data = await getMonthlySummary(compiledFilters)
          break
        case 'yearly_summary':
          data = await getYearlySummary(compiledFilters)
          break
        case 'exceptions':
          data = await getExceptionReport(compiledFilters)
          break
        case 'audit_trail':
          data = await getAuditReport(compiledFilters)
          break
        case 'purchase_register':
          const pur = await getTransactionHistory({ ...compiledFilters, transactionType: 'PURCHASE' })
          data = pur
          break
        case 'sales_register':
          const sal = await getTransactionHistory({ ...compiledFilters, transactionType: 'SALE' })
          data = sal
          break
        case 'transfer_register':
          const trf = await getTransactionHistory({ ...compiledFilters, transactionType: 'TRANSFER' })
          data = trf
          break
        case 'stock_movement':
          data = await getTransactionHistory(compiledFilters)
          break
        case 'returns_register':
          data = await getTransactionHistory({ ...compiledFilters, transactionType: 'RETURN' })
          break
        case 'adjustment_register':
          data = await getTransactionHistory({ ...compiledFilters, transactionType: 'ADJUSTMENT' })
          break
        case 'driver_ledger':
          // Generate driver statements for each driver and map them
          const drvList = await Promise.all(
            drivers.map(async (d) => {
              const statement = await window.api.invoke('drivers:getStatementReport', d.id, {
                startDate: startDate || undefined,
                endDate: endDate || undefined,
              })
              
              // Calculate counts of transfers/sales
              let received = 0
              let transferredIn = 0
              let transferredOut = 0
              let sold = 0
              let returned = 0
              let adjusted = 0

              statement.lines.forEach((l: any) => {
                if (l.transactionType === 'TRANSFER') {
                  if (l.isDest) transferredIn += l.quantity
                  else transferredOut += l.quantity
                } else if (l.transactionType === 'SALE') {
                  sold += l.quantity
                } else if (l.transactionType === 'RETURN') {
                  returned += l.quantity
                } else if (l.transactionType === 'ADJUSTMENT') {
                  adjusted += l.quantity
                } else if (l.transactionType === 'PURCHASE') {
                  received += l.quantity
                }
              })

              return {
                id: d.id,
                driverName: d.name,
                openingBalance: statement.openingBalance,
                received,
                transferredIn,
                transferredOut,
                sold,
                returned,
                adjusted,
                closingBalance: statement.closingBalance,
              }
            })
          )
          data = drvList
          break
        case 'customer_ledger':
          const custList = await Promise.all(
            customers.map(async (c) => {
              const statement = await window.api.invoke('customers:getStatementReport', c.id, {
                startDate: startDate || undefined,
                endDate: endDate || undefined,
              })
              return {
                id: c.id,
                customerName: c.companyName,
                purchases: statement.summary.lifetimeVolume,
                revenue: statement.summary.lifetimeAmount,
                averageRate: statement.summary.averagePrice,
                lastPurchase: statement.summary.lastPurchaseDate || 'N/A',
                closingBalance: statement.closingBalance,
              }
            })
          )
          data = custList
          break
        case 'supplier_ledger':
          // Fetch purchases grouped by supplier
          const allTxs = await getTransactionHistory({ ...compiledFilters, transactionType: 'PURCHASE' })
          const supGroup: Record<string, { companyName: string; count: number; volume: number; cost: number; lastDate: string }> = {}
          
          allTxs.forEach((tx) => {
            const supObj = suppliers.find((s) => s.id === tx.sourceId)
            const name = supObj ? supObj.companyName : 'Unknown Supplier'
            if (!supGroup[tx.sourceId]) {
              supGroup[tx.sourceId] = {
                companyName: name,
                count: 0,
                volume: 0,
                cost: 0,
                lastDate: tx.transactionDate,
              }
            }
            const row = supGroup[tx.sourceId]
            row.count++
            row.volume += tx.quantity
            row.cost += Math.round(tx.quantity * tx.unitCost)
            if (tx.transactionDate > row.lastDate) row.lastDate = tx.transactionDate
          })
          data = Object.values(supGroup).map((s) => ({
            companyName: s.companyName,
            purchasesCount: s.count,
            totalVolume: s.volume,
            averageCost: s.volume > 0 ? Math.round(s.cost / s.volume) : 0,
            totalAmount: s.cost,
            lastPurchase: s.lastDate,
          }))
          break
      }

      setReportData(data)
      if (showToast) {
        addToast('Report updated successfully', 'success')
      }
    } catch (e: any) {
      addToast(e.message || 'Failed to generate report', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Load report on filter/category changes
  useEffect(() => {
    runReport(false)
  }, [selectedCat])

  // Short cut for run report (Ctrl+R)
  useShortcutEffect('refresh', () => runReport(true))

  // ----------------------------------------------------
  // Dynamic Columns Mapping
  // ----------------------------------------------------
  const reportColumns = useMemo((): GridColumn<any>[] => {
    let cols: GridColumn<any>[] = []

    switch (selectedCat) {
      case 'profit_analysis':
        cols = [
          { key: 'rank', header: 'Rank', width: 60 },
          { key: 'entity', header: 'Customer Entity Name', width: 220 },
          { key: 'quantity', header: `Total Volume (${unit})`, width: 120, type: 'number' },
          { key: 'revenue', header: 'Total Revenue Invoiced', width: 140, type: 'currency' },
          { key: 'profit', header: 'Margin Profit Value', width: 140, type: 'currency' },
        ]
        break
      case 'inventory_valuation':
        cols = [
          { key: 'locationName', header: 'Storage Tank / Vehicle', width: 220 },
          { key: 'locationType', header: 'Type', width: 110 },
          { key: 'capacity', header: `Volume Capacity (${unit})`, width: 130, type: 'number' },
          { key: 'currentStock', header: `Current Stock (${unit})`, width: 125, type: 'number' },
          { key: 'weightedAverageCost', header: `Carrying WAC (${symbol}/${unit})`, width: 125, type: 'currency' },
          { key: 'totalAssetValue', header: 'Asset Asset Value', width: 140, type: 'currency' },
        ]
        break
      case 'daily_summary':
      case 'monthly_summary':
      case 'yearly_summary':
        const dateKey = selectedCat === 'daily_summary' ? 'date' : selectedCat === 'monthly_summary' ? 'month' : 'year'
        cols = [
          { key: dateKey, header: 'Period', width: 110 },
          { key: 'purchasesQty', header: `Purchased Vol (${unit})`, width: 120, type: 'number' },
          { key: 'purchasesAmt', header: 'Purchases Cost', width: 120, type: 'currency' },
          { key: 'salesQty', header: `Sales Vol (${unit})`, width: 110, type: 'number' },
          { key: 'salesRevenue', header: 'Sales Revenue', width: 120, type: 'currency' },
          { key: 'salesProfit', header: 'Gross Margins', width: 120, type: 'currency' },
          { key: 'transfersQty', header: 'Transfer Loadings', width: 120, type: 'number' },
        ]
        break
      case 'purchase_register':
        cols = [
          { key: 'transactionNumber', header: 'Tx No', width: 100 },
          { key: 'transactionDate', header: 'Date', width: 95 },
          {
            key: 'sourceId',
            header: 'Supplier Refinery',
            width: 180,
            render: (row) => suppliers.find((s) => s.id === row.sourceId)?.companyName || 'Refinery Bulk',
          },
          { key: 'quantity', header: `Volume (${unit})`, width: 100, type: 'number' },
          { key: 'unitCost', header: 'Unit Cost', width: 90, type: 'currency' },
          {
            key: 'total',
            header: 'Total Cost',
            width: 110,
            type: 'currency',
            render: (row) => Math.round(row.quantity * row.unitCost),
          },
          { key: 'referenceNumber', header: 'Ref Challan', width: 100 },
          { key: 'createdBy', header: 'Operator', width: 110 },
        ]
        break
      case 'sales_register':
        cols = [
          { key: 'transactionNumber', header: 'Invoice No', width: 100 },
          { key: 'transactionDate', header: 'Date', width: 95 },
          {
            key: 'destinationId',
            header: 'Customer Co.',
            width: 170,
            render: (row) => customers.find((c) => c.id === row.destinationId)?.companyName || 'Client',
          },
          { key: 'quantity', header: `Volume (${unit})`, width: 100, type: 'number' },
          { key: 'sellingRate', header: 'Sale Rate', width: 90, type: 'currency' },
          { key: 'averageCostSnapshot', header: 'WAC Cost', width: 95, type: 'currency' },
          {
            key: 'revenue',
            header: 'Revenue',
            width: 105,
            type: 'currency',
            render: (row) => Math.round(row.quantity * row.sellingRate),
          },
          { key: 'profitSnapshot', header: 'Gross Profit', width: 105, type: 'currency' },
          { key: 'referenceNumber', header: 'Delivery Ref', width: 100 },
          { key: 'createdBy', header: 'Operator', width: 110 },
        ]
        break
      case 'transfer_register':
        cols = [
          { key: 'transactionNumber', header: 'Gate Pass No', width: 105 },
          { key: 'transactionDate', header: 'Date', width: 95 },
          {
            key: 'sourceId',
            header: 'Source Location',
            width: 160,
            render: (row) => {
               const d = drivers.find((drv) => drv.id === row.sourceId)
               const s = suppliers.find((sup) => sup.id === row.sourceId)
               return d ? d.name : s ? s.companyName : row.sourceId
            },
          },
          {
            key: 'destinationId',
            header: 'Destination',
            width: 160,
            render: (row) => {
               const d = drivers.find((drv) => drv.id === row.destinationId)
               const c = customers.find((cust) => cust.id === row.destinationId)
               return d ? d.name : c ? c.companyName : row.destinationId
            },
          },
          { key: 'quantity', header: `Volume (${unit})`, width: 100, type: 'number' },
          { key: 'unitCost', header: 'WAC Carrier', width: 100, type: 'currency' },
          { key: 'referenceNumber', header: 'Ref GatePass', width: 100 },
          { key: 'createdBy', header: 'Operator', width: 110 },
        ]
        break
      case 'supplier_ledger':
        cols = [
          { key: 'companyName', header: 'Supplier Name', width: 220 },
          { key: 'purchasesCount', header: 'Invoice Count', width: 110, type: 'number' },
          { key: 'totalVolume', header: `Total Volume (${unit})`, width: 130, type: 'number' },
          { key: 'averageCost', header: 'Weighted Avg Cost', width: 130, type: 'currency' },
          { key: 'totalAmount', header: 'Total Paid Assets', width: 140, type: 'currency' },
          { key: 'lastPurchase', header: 'Last Purchase Date', width: 130 },
        ]
        break
      case 'driver_ledger':
        cols = [
          { key: 'driverName', header: 'Driver Truck Name', width: 180 },
          { key: 'openingBalance', header: `Opening (${unit})`, width: 105, type: 'number' },
          { key: 'transferredIn', header: 'Transferred In', width: 110, type: 'number' },
          { key: 'transferredOut', header: 'Transferred Out', width: 115, type: 'number' },
          { key: 'sold', header: `Total Sold (${unit})`, width: 110, type: 'number' },
          { key: 'adjusted', header: `Adjusted (${unit})`, width: 105, type: 'number' },
          { key: 'closingBalance', header: 'Closing Stock', width: 110, type: 'number' },
        ]
        break
      case 'customer_ledger':
        cols = [
          { key: 'customerName', header: 'Customer Entity', width: 200 },
          { key: 'purchases', header: `Purchased Vol (${unit})`, width: 125, type: 'number' },
          { key: 'revenue', header: `Total Invoiced (${symbol})`, width: 130, type: 'currency' },
          { key: 'averageRate', header: 'Avg Selling Rate', width: 125, type: 'currency' },
          { key: 'closingBalance', header: 'Outstanding Balance', width: 130, type: 'currency' },
          { key: 'lastPurchase', header: 'Last Sale Date', width: 120 },
        ]
        break
      case 'stock_movement':
        cols = [
          { key: 'transactionNumber', header: 'Tx No', width: 95 },
          { key: 'transactionDate', header: 'Date', width: 95 },
          { key: 'transactionType', header: 'Tx Type', width: 100 },
          {
            key: 'sourceId',
            header: 'Source Origin',
            width: 140,
            render: (row) => {
               const d = drivers.find((drv) => drv.id === row.sourceId)
               const s = suppliers.find((sup) => sup.id === row.sourceId)
               return d ? d.name : s ? s.companyName : row.sourceId
            },
          },
          {
            key: 'destinationId',
            header: 'Destination Location',
            width: 140,
            render: (row) => {
               const d = drivers.find((drv) => drv.id === row.destinationId)
               const cust = customers.find((c) => c.id === row.destinationId)
               return d ? d.name : cust ? cust.companyName : row.destinationId
            },
          },
          { key: 'quantity', header: `Volume (${unit})`, width: 95, type: 'number' },
          { key: 'unitCost', header: 'Unit Cost', width: 90, type: 'currency' },
          { key: 'sellingRate', header: 'Sale Rate', width: 90, type: 'currency' },
          { key: 'averageCostSnapshot', header: 'WAC Snapshot', width: 100, type: 'currency' },
          { key: 'profitSnapshot', header: 'Profit Value', width: 95, type: 'currency' },
        ]
        break
      case 'exceptions':
        cols = [
          { key: 'type', header: 'Anomaly Type', width: 130 },
          {
            key: 'severity',
            header: 'Severity',
            width: 90,
            render: (row) => (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                row.severity === 'HIGH' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              }`}>
                {row.severity}
              </span>
            ),
          },
          { key: 'description', header: 'Failure Description Details', width: 340 },
          { key: 'transactionDate', header: 'Event Date', width: 105 },
          { key: 'transactionNumber', header: 'Tx Ref', width: 100 },
        ]
        break
      case 'audit_trail':
        cols = [
          { key: 'entityName', header: 'Registry Table', width: 120 },
          { key: 'entityId', header: 'Item UUID', width: 150 },
          { key: 'action', header: 'CRUD Action', width: 100 },
          { key: 'timestamp', header: 'Audit Date-Time', width: 140 },
          { key: 'user', header: 'Operator', width: 110 },
        ]
        break
      default:
        cols = [
          { key: 'transactionNumber', header: 'Tx No', width: 100 },
          { key: 'transactionDate', header: 'Date', width: 100 },
          { key: 'transactionType', header: 'Type', width: 100 },
          { key: 'quantity', header: `Quantity (${unit})`, width: 110, type: 'number' },
        ]
    }

    // Apply active columns filter checklist
    return cols.filter((col) => colPrefs[col.key] !== false)
  }, [selectedCat, colPrefs, suppliers, customers, drivers, symbol, unit])

  // Initialize all columns as visible when category changes
  useEffect(() => {
    const prefs: Record<string, boolean> = {}
    // Reset columns checklist
    setColPrefs(prefs)
  }, [selectedCat])

  // ----------------------------------------------------
  // Dynamic Local Totals
  // ----------------------------------------------------
  const summaryAggregates = useMemo(() => {
    let volume = 0
    let amount = 0
    let profit = 0
    const count = reportData.length

    reportData.forEach((row) => {
      // Aggregate quantities
      if (row.quantity !== undefined) volume += row.quantity
      else if (row.totalVolume !== undefined) volume += row.totalVolume
      else if (row.currentStock !== undefined) volume += row.currentStock
      else if (row.purchasesQty !== undefined) volume += row.purchasesQty + (row.salesQty || 0)

      // Aggregate financial amounts
      if (row.transactionType === 'SALE') {
        amount += Math.round(row.quantity * row.sellingRate)
        profit += row.profitSnapshot || 0
      } else if (row.transactionType === 'PURCHASE') {
        amount += Math.round(row.quantity * row.unitCost)
      } else if (row.totalAmount !== undefined) {
        amount += row.totalAmount
      } else if (row.revenue !== undefined) {
        amount += row.revenue
        profit += row.profit || 0
      } else if (row.salesRevenue !== undefined) {
        amount += row.salesRevenue
        profit += row.salesProfit || 0
      } else if (row.totalAssetValue !== undefined) {
        amount += row.totalAssetValue
      }
    })

    return {
      volume,
      amount, // in cents
      profit, // in cents
      count,
    }
  }, [reportData])

  // ----------------------------------------------------
  // PRINT & EXPORT SERVICE HANDLERS
  // ----------------------------------------------------
  const handlePrint = () => {
    window.print()
  }

  // Export to standard CSV
  const handleExportCSV = () => {
    if (reportData.length === 0) {
      addToast('No data available to export', 'error')
      return
    }

    const headers = reportColumns.map((col) => col.header).join(',')
    const rows = reportData.map((row, rowIndex) => {
      return reportColumns
        .map((col) => {
          let cell = ''
          if (col.render) {
            // strip html tags
            const rendered = col.render(row, rowIndex)
            cell = typeof rendered === 'object' ? '' : String(rendered)
          } else {
            cell = row[col.key] !== undefined ? String(row[col.key]) : ''
          }
          // Escape quotes
          return `"${cell.replace(/"/g, '""')}"`
        })
        .join(',')
    })

    const csvContent = [headers, ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `report-${selectedCat}-${new Date().toISOString().split('T')[0]}.csv`)
    link.click()
    addToast('CSV export downloaded', 'success')
  }

  // Export to Excel-ready TSV (Tab Separated Values)
  const handleExportExcel = () => {
    if (reportData.length === 0) {
      addToast('No data available to export', 'error')
      return
    }

    const headers = reportColumns.map((col) => col.header).join('\t')
    const rows = reportData.map((row, rowIndex) => {
      return reportColumns
        .map((col) => {
          let cell = ''
          if (col.render) {
            const rendered = col.render(row, rowIndex)
            cell = typeof rendered === 'object' ? '' : String(rendered)
          } else {
            cell = row[col.key] !== undefined ? String(row[col.key]) : ''
          }
          return cell.replace(/\t/g, ' ')
        })
        .join('\t')
    })

    const tsvContent = [headers, ...rows].join('\r\n')
    const blob = new Blob([tsvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `report-${selectedCat}-${new Date().toISOString().split('T')[0]}.xls`)
    link.click()
    addToast('Excel Spreadsheet exported', 'success')
  }

  const handleExportPDF = () => {
    if (reportData.length === 0) {
      addToast('No data available to export', 'error')
      return
    }

    try {
      PdfService.generateReportPDF(selectedCat, reportData, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        companyName: 'Malak Enterprise',
        drivers,
        customers,
        suppliers,
        profitSummary: profitSummary || undefined,
        operator: localStorage.getItem('diesel_user') || 'ERP Operator',
      })
      addToast('PDF report downloaded', 'success')
    } catch (e: any) {
      addToast(e.message || 'Failed to export PDF', 'error')
    }
  }

  // ----------------------------------------------------
  // SAVED FILTER CONFIGURATIONS HANDLERS
  // ----------------------------------------------------
  const handleSaveConfig = () => {
    if (!newConfigName.trim()) {
      addToast('Please enter a configuration name', 'error')
      return
    }

    const config = {
      name: newConfigName.trim(),
      category: selectedCat,
      filters: {
        datePreset,
        startDate,
        endDate,
        driverId,
        customerId,
        supplierId,
        txType,
        refNum,
        operator,
        notes,
        minQty,
        maxQty,
        minRate,
        maxRate,
      },
    }

    const updated = [...savedConfigs, config]
    setSavedConfigs(updated)
    localStorage.setItem('saved_reports_configs', JSON.stringify(updated))
    setNewConfigName('')
    setShowSaveModal(false)
    addToast(`Configuration "${config.name}" saved`, 'success')
  }

  const handleLoadConfig = (config: any) => {
    setSelectedCat(config.category)
    setDatePreset(config.filters.datePreset)
    setStartDate(config.filters.startDate)
    setEndDate(config.filters.endDate)
    setDriverId(config.filters.driverId || '')
    setCustomerId(config.filters.customerId || '')
    setSupplierId(config.filters.supplierId || '')
    setTxType(config.filters.txType || '')
    setRefNum(config.filters.refNum || '')
    setOperator(config.filters.operator || '')
    setNotes(config.filters.notes || '')
    setMinQty(config.filters.minQty || '')
    setMaxQty(config.filters.maxQty || '')
    setMinRate(config.filters.minRate || '')
    setMaxRate(config.filters.maxRate || '')
    addToast(`Configuration "${config.name}" loaded`, 'success')
  }

  const handleDeleteConfig = (name: string) => {
    const updated = savedConfigs.filter((c) => c.name !== name)
    setSavedConfigs(updated)
    localStorage.setItem('saved_reports_configs', JSON.stringify(updated))
    addToast(`Configuration "${name}" removed`, 'info')
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] overflow-hidden gap-4 select-none">
      {/* 1. Sidebar Categories List (no-print) */}
      <aside className="w-64 bg-white border rounded shadow-subtle flex flex-col shrink-0 no-print">
        <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Report Categories</span>
        </div>
        <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
          {categories.map((cat) => {
            const Icon = cat.icon
            const isSelected = selectedCat === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex items-center justify-between group cursor-pointer ${
                  isSelected ? 'bg-blue-600 text-white font-bold' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title={cat.description}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon size={14} className={isSelected ? 'text-white' : 'text-gray-400'} />
                  <span className="truncate">{cat.name}</span>
                </div>
                <ChevronRight size={12} className={isSelected ? 'text-white' : 'text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity'} />
              </button>
            )
          })}
        </div>
      </aside>

      {/* 2. Main Viewer Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white border rounded shadow-subtle print-container">
        {/* Toolbar & Saved Reports Configuration (no-print) */}
        <div className="p-3 bg-gray-50 border-b flex items-center justify-between no-print shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-gray-800 uppercase tracking-wide">
              {categories.find((c) => c.id === selectedCat)?.name} Report
            </span>

            {/* Configs dropdown */}
            {savedConfigs.length > 0 && (
              <div className="relative group ml-4">
                <button className="px-2.5 py-1 text-[11px] bg-white border rounded text-gray-600 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5">
                  <span>Saved Setups ({savedConfigs.length})</span>
                </button>
                <div className="absolute left-0 mt-1 w-56 bg-white border rounded shadow-xl z-20 hidden group-hover:block max-h-48 overflow-y-auto">
                  {savedConfigs.map((cfg) => (
                    <div key={cfg.name} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 text-[11px] text-gray-700">
                      <button onClick={() => handleLoadConfig(cfg)} className="text-left font-semibold truncate flex-1 hover:text-blue-600 cursor-pointer">
                        {cfg.name}
                      </button>
                      <button onClick={() => handleDeleteConfig(cfg.name)} className="text-red-500 hover:text-red-700 shrink-0 ml-2 cursor-pointer">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Column Hide/Show checklist */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowColMenu(!showColMenu)} className="gap-1.5">
                <Sliders size={12} />
                <span>Columns</span>
              </Button>
              {showColMenu && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border rounded-lg shadow-2xl z-30 p-2.5 space-y-1.5">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b pb-1">Toggle Columns</div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {reportColumns.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 text-[11px] text-gray-700 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={colPrefs[col.key] !== false}
                          onChange={(e) => setColPrefs({ ...colPrefs, [col.key]: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span>{col.header}</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => setShowColMenu(false)} className="w-full text-center py-1 mt-1 text-[10px] text-blue-600 font-bold bg-blue-50 rounded hover:bg-blue-100 cursor-pointer">
                    Apply
                  </button>
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowSaveModal(true)} className="gap-1.5">
              <Save size={12} />
              <span>Save Filters</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5" title="Export to CSV">
              <Download size={12} />
              <span>CSV</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5" title="Export to Excel">
              <FileSpreadsheet size={12} />
              <span>Excel</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5" title="Export to PDF">
              <Download size={12} className="rotate-180" />
              <span>PDF</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer size={12} />
              <span>Print A4</span>
            </Button>
          </div>
        </div>

        {/* Global Filter Panel (no-print) */}
        <div className="p-4 border-b grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 no-print bg-white shrink-0">
          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Date Preset</label>
            <Select
              options={[
                { value: 'this_month', label: 'This Month' },
                { value: 'today', label: 'Today Only' },
                { value: 'yesterday', label: 'Yesterday' },
                { value: 'last_7_days', label: 'Last 7 Days' },
                { value: 'last_month', label: 'Last Month' },
                { value: 'this_year', label: 'This Year' },
                { value: 'custom', label: 'Custom Range' },
              ]}
              value={datePreset}
              onChange={(e: any) => setDatePreset(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Start Date</label>
            <input
              type="date"
              className="w-full px-2 py-1 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom') }}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">End Date</label>
            <input
              type="date"
              className="w-full px-2 py-1 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom') }}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Driver / Truck</label>
            <Select
              options={[
                { value: '', label: 'All Drivers' },
                ...drivers.map((d) => ({ value: d.id, label: d.name })),
              ]}
              value={driverId}
              onChange={(e: any) => setDriverId(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Customer Co.</label>
            <Select
              options={[
                { value: '', label: 'All Customers' },
                ...customers.map((c) => ({ value: c.id, label: c.companyName })),
              ]}
              value={customerId}
              onChange={(e: any) => setCustomerId(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Refinery Supplier</label>
            <Select
              options={[
                { value: '', label: 'All Suppliers' },
                ...suppliers.map((s) => ({ value: s.id, label: s.companyName })),
              ]}
              value={supplierId}
              onChange={(e: any) => setSupplierId(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Reference text</label>
            <input
              type="text"
              placeholder="Challan/Gate Pass..."
              className="w-full px-2 py-1.5 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={refNum}
              onChange={(e) => setRefNum(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Operator User</label>
            <input
              type="text"
              placeholder="Creator name..."
              className="w-full px-2 py-1.5 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Notes Contains</label>
            <input
              type="text"
              placeholder="Keywords..."
              className="w-full px-2 py-1.5 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Volume Range (Min - Max)</label>
            <div className="flex gap-1.5">
              <input
                type="number"
                placeholder="Min"
                className="w-1/2 px-1.5 py-1 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
              />
              <input
                type="number"
                placeholder="Max"
                className="w-1/2 px-1.5 py-1 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={maxQty}
                onChange={(e) => setMaxQty(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-gray-400 uppercase">Rate Range (Min - Max)</label>
            <div className="flex gap-1.5">
              <input
                type="number"
                step="0.01"
                placeholder={`Min ${symbol}`}
                className="w-1/2 px-1.5 py-1 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={minRate}
                onChange={(e) => setMinRate(e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                placeholder={`Max ${symbol}`}
                className="w-1/2 px-1.5 py-1 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={maxRate}
                onChange={(e) => setMaxRate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-end justify-between gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDatePreset('this_month')
                setDriverId('')
                setCustomerId('')
                setSupplierId('')
                setTxType('')
                setRefNum('')
                setOperator('')
                setNotes('')
                setMinQty('')
                setMaxQty('')
                setMinRate('')
                setMaxRate('')
              }}
              className="w-full text-center"
            >
              Clear Filters
            </Button>
            
            <Button variant="primary" size="sm" onClick={() => runReport(true)} className="w-full gap-1.5">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              <span>Apply</span>
            </Button>
          </div>
        </div>

        {/* 3. Summary Cards (Always Visible, formatted nicely on print) */}
        <div className="p-4 border-b bg-gray-50/50 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0 shadow-sm print:bg-transparent print:border-b-2 font-mono">
          {selectedCat === 'profit_analysis' && profitSummary ? (
            <>
              <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Total Volume Sold</span>
                <p className="text-sm font-black text-gray-800">{FormattingService.formatQuantity(profitSummary.totalQuantitySold)}</p>
              </div>
              <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Total Revenue Value</span>
                <p className="text-sm font-black text-green-700">{FormattingService.formatCurrency(profitSummary.revenue)}</p>
              </div>
              <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Net COGS Cost</span>
                <p className="text-sm font-black text-gray-800">{FormattingService.formatCurrency(profitSummary.cost)}</p>
              </div>
              <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Gross Margin Profit</span>
                <p className="text-sm font-black text-emerald-700">{FormattingService.formatCurrency(profitSummary.grossProfit)} <span className="text-[10px] text-gray-400 font-normal">({profitSummary.averageMargin}%)</span></p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Records Loaded</span>
                <p className="text-sm font-black text-gray-800 font-sans">{summaryAggregates.count}</p>
              </div>
              <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Aggregated Volume</span>
                <p className="text-sm font-black text-gray-800">{FormattingService.formatQuantity(summaryAggregates.volume)}</p>
              </div>
              <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans font-sans">Financial Value</span>
                <p className="text-sm font-black text-blue-700">{FormattingService.formatCurrency(summaryAggregates.amount)}</p>
              </div>
              {summaryAggregates.profit > 0 && (
                <div className="bg-white border rounded p-3 select-none print:border-0 print:p-0">
                  <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Estimated Margins</span>
                  <p className="text-sm font-black text-emerald-700">{FormattingService.formatCurrency(summaryAggregates.profit)}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Print Only Custom Header Layout */}
        <div className="print-only hidden select-none p-4 border-b-2">
          <h2 className="text-lg font-black uppercase text-gray-900">MALAK ENTERPRISE DIESEL INVENTORY STATEMENT</h2>
          <div className="grid grid-cols-2 text-[10px] text-gray-500 mt-2 font-mono">
            <div>Report Category: <span className="font-bold text-gray-800 uppercase">{categories.find((c) => c.id === selectedCat)?.name}</span></div>
            <div>Print Timestamp: <span className="font-bold text-gray-800">{new Date().toLocaleString()}</span></div>
            <div>Date Limit: <span className="font-bold text-gray-800">{startDate || 'Any'} to {endDate || 'Any'}</span></div>
            <div>Generated By: <span className="font-bold text-gray-800">{localStorage.getItem('diesel_user') || 'ERP Operator'}</span></div>
          </div>
        </div>

        {/* 4. Main DataGrid Viewer */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50/50 print:bg-white print:p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-xs select-none">
              <RefreshCw className="animate-spin mb-2" size={16} />
              Recalculating ledger rows...
            </div>
          ) : reportData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-gray-400 select-none border border-dashed rounded bg-white">
              No matching records found. Refine your filters or load a different category.
            </div>
          ) : (
            <DataGrid
              columns={reportColumns}
              data={reportData}
            />
          )}
        </div>
      </main>

      {/* Save Filter Preset Modal Dialog */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 select-none">
          <div className="bg-white border rounded-lg shadow-2xl p-5 w-80 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-800 border-b pb-2">Save Report Setup</h3>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Configuration Name</label>
              <input
                type="text"
                placeholder="e.g. Driver Sales June..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 text-xs">
              <button onClick={() => setShowSaveModal(false)} className="px-3 py-1 bg-white hover:bg-gray-50 border rounded font-semibold text-gray-700 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSaveConfig} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold cursor-pointer">
                Save Setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
