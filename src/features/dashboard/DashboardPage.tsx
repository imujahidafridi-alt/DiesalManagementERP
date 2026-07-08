import { useState, useEffect, useMemo } from 'react'
import { Button, DataGrid, useShortcutEffect, SvgChart } from '@/components/ui'
import { useUiStore, useAppStore } from '@/store'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import { FormattingService } from '@/utils/FormattingService'
import {
  Database,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  Activity,
  Award,
  DollarSign,
} from 'lucide-react'
import type { GridColumn } from '@/components/ui/DataGrid'

export default function DashboardPage() {
  const { quantityAbbreviation } = useBusinessSettings()
  const { addToast } = useUiStore()
  const {
    fetchPurchases,
    fetchSales,
    fetchInventorySnapshots,
    fetchDrivers,
    fetchCustomers,
    fetchSuppliers,
    suppliers,
    inventorySnapshots,
    drivers,
    customers,
  } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [allTransactions, setAllTransactions] = useState<any[]>([])

  const loadDashboardData = async (isManual = false) => {
    setLoading(true)
    try {
      // Load all workspace resources in parallel
      await Promise.all([
        fetchPurchases(),
        fetchSales(),
        fetchInventorySnapshots(),
        fetchDrivers(),
        fetchCustomers(),
        fetchSuppliers(),
      ])

      // Fetch all transactions to process local statistics
      const txs = await window.api.invoke('transactions:list')
      setAllTransactions(txs || [])
      if (isManual) {
        addToast('Dashboard data refreshed successfully', 'success')
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to refresh dashboard data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData(false)
  }, [])

  useShortcutEffect('refresh', () => loadDashboardData(true))

  // ----------------------------------------------------
  // Local Business Math Calculations
  // ----------------------------------------------------
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const currentMonthStr = new Date().toISOString().substring(0, 7) // YYYY-MM

    // 1. Inventory Valuation
    let totalStock = 0
    let totalValuation = 0 // in cents

    for (const snap of inventorySnapshots) {
      const isDriver = drivers.some((d) => d.id === snap.item)
      if (isDriver) {
        totalStock += snap.currentStock
        totalValuation += Math.round(snap.currentStock * snap.weightedAverageCost)
      }
    }

    // 2. Today's Indicators
    let todayPurchasesVol = 0
    let todaySalesVol = 0
    let todayRevenueAmt = 0 // in cents
    let todayProfitAmt = 0 // in cents

    // 3. Monthly Indicators
    let monthPurchasesVol = 0
    let monthSalesVol = 0
    let monthRevenueAmt = 0 // in cents
    let monthProfitAmt = 0 // in cents

    // 4. Aggregators for Top Customer & Driver
    const customerSalesMap: Record<string, { name: string; profit: number }> = {}
    const driverSalesMap: Record<string, { name: string; profit: number }> = {}

    for (const tx of allTransactions) {
      const isToday = tx.transactionDate === todayStr
      const isThisMonth = tx.transactionDate.startsWith(currentMonthStr)
      const txAmount = Math.round(tx.quantity * (tx.transactionType === 'SALE' ? tx.sellingRate : tx.unitCost))

      if (tx.transactionType === 'PURCHASE') {
        if (isToday) todayPurchasesVol += tx.quantity
        if (isThisMonth) monthPurchasesVol += tx.quantity
      }

      if (tx.transactionType === 'SALE') {
        if (isToday) {
          todaySalesVol += tx.quantity
          todayRevenueAmt += txAmount
          todayProfitAmt += tx.profitSnapshot
        }
        if (isThisMonth) {
          monthSalesVol += tx.quantity
          monthRevenueAmt += txAmount
          monthProfitAmt += tx.profitSnapshot
        }

        // Top Customer aggregations (using destinationId)
        const custObj = customers.find((c) => c.id === tx.destinationId)
        const custName = custObj ? custObj.companyName : 'Unknown Customer'
        if (!customerSalesMap[tx.destinationId]) {
          customerSalesMap[tx.destinationId] = { name: custName, profit: 0 }
        }
        customerSalesMap[tx.destinationId].profit += tx.profitSnapshot

        // Top Driver aggregations (sourceId points to driver)
        const drvObj = drivers.find((d) => d.id === tx.sourceId)
        if (drvObj) {
          if (!driverSalesMap[drvObj.id]) {
            driverSalesMap[drvObj.id] = { name: drvObj.name, profit: 0 }
          }
          driverSalesMap[drvObj.id].profit += tx.profitSnapshot
        }
      }
    }

    // Solve Top Driver & Top Customer
    let topCustomerName = 'N/A'
    let topCustomerProfit = 0
    Object.values(customerSalesMap).forEach((c) => {
      if (c.profit > topCustomerProfit) {
        topCustomerProfit = c.profit
        topCustomerName = c.name
      }
    })

    let topDriverName = 'N/A'
    let topDriverProfit = 0
    Object.values(driverSalesMap).forEach((d) => {
      if (d.profit > topDriverProfit) {
        topDriverProfit = d.profit
        topDriverName = d.name
      }
    })

    // 5. Recent Active Alerts
    const alerts: { title: string; desc: string; type: 'warning' | 'info' }[] = []
    


    // Top driver stock holder info alert
    let maxStock = -1
    let maxStockDriverName = ''
    drivers.forEach((d) => {
      const snap = inventorySnapshots.find((s) => s.item === d.id)
      const stock = snap ? snap.currentStock : 0
      if (stock > maxStock) {
        maxStock = stock
        maxStockDriverName = d.name
      }
    })
    if (maxStock > 0) {
      alerts.push({
        title: 'Top Driver Stock Holder',
        desc: `Driver ${maxStockDriverName} currently holds the highest diesel stock: ${FormattingService.formatQuantity(maxStock)}.`,
        type: 'info',
      })
    }



    return {
      totalStock,
      totalValuation: totalValuation / 100, // dollars
      todayPurchasesVol,
      todaySalesVol,
      todayRevenueAmt: todayRevenueAmt / 100,
      todayProfitAmt: todayProfitAmt / 100,
      monthPurchasesVol,
      monthSalesVol,
      monthRevenueAmt: monthRevenueAmt / 100,
      monthProfitAmt: monthProfitAmt / 100,
      topCustomerName,
      topDriverName,
      alerts,
    }
  }, [allTransactions, inventorySnapshots, drivers, customers])

  // ----------------------------------------------------
  // Chart Processing Data
  // ----------------------------------------------------
  const chartData = useMemo(() => {
    // 1. Stock Distribution by Location
    const stockDistribution = inventorySnapshots
      .filter((snap) => snap.currentStock > 0)
      .map((snap) => {
        const drv = drivers.find((d) => d.id === snap.item)
        let label = snap.item
        if (drv) {
          label = drv.name
        }
        return {
          label,
          value: snap.currentStock,
        }
      })

    // 2. Daily Sales Volumes for the last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      return d.toISOString().split('T')[0]
    }).reverse()

    const dailySales = last7Days.map((day) => {
      const daySales = allTransactions
        .filter((tx) => tx.transactionType === 'SALE' && tx.transactionDate === day)
        .reduce((sum, tx) => sum + tx.quantity, 0)
      return {
        label: day.substring(5), // MM-DD
        value: daySales,
      }
    })

    // 3. Monthly Sales vs Purchases (Last 6 Months)
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      return d.toISOString().substring(0, 7) // YYYY-MM
    }).reverse()

    const monthlyTrends = last6Months.map((mon) => {
      const monSales = allTransactions
        .filter((tx) => tx.transactionType === 'SALE' && tx.transactionDate.startsWith(mon))
        .reduce((sum, tx) => sum + tx.quantity, 0)
      const monPurchases = allTransactions
        .filter((tx) => tx.transactionType === 'PURCHASE' && tx.transactionDate.startsWith(mon))
        .reduce((sum, tx) => sum + tx.quantity, 0)

      return {
        label: mon, // YYYY-MM
        value: monSales,
        secondaryValue: monPurchases,
      }
    })

    return {
      stockDistribution,
      dailySales,
      monthlyTrends,
    }
  }, [allTransactions, inventorySnapshots, drivers])

  // ----------------------------------------------------
  // Recent Activity Columns & Logs (Last 10 transactions)
  // ----------------------------------------------------
  const recentLogs = useMemo(() => {
    const sorted = [...allTransactions]
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)

    return sorted.map((tx) => {
      let descText = ''
      if (tx.transactionType === 'PURCHASE') {
        const supObj = suppliers.find((s) => s.id === tx.sourceId)
        const name = supObj ? supObj.companyName : 'Supplier'
        descText = `Bought ${FormattingService.formatQuantity(tx.quantity)} from ${name} at ${FormattingService.formatRate(tx.unitCost)}`
      } else if (tx.transactionType === 'SALE') {
        const cust = customers.find((c) => c.id === tx.destinationId)
        descText = `Sold ${FormattingService.formatQuantity(tx.quantity)} to ${cust ? cust.companyName : 'Customer'} at ${FormattingService.formatRate(tx.sellingRate)}`
      } else if (tx.transactionType === 'TRANSFER') {
        descText = `Transferred ${FormattingService.formatQuantity(tx.quantity)}`
      } else {
        descText = `${tx.transactionType} adjustment of ${FormattingService.formatQuantity(tx.quantity)}`
      }

      return {
        id: tx.id,
        time: tx.transactionDate,
        actionType: tx.transactionType,
        details: descText,
        user: tx.createdBy,
      }
    })
  }, [allTransactions, customers])

  const columns: GridColumn<any>[] = [
    { key: 'time', header: 'Date', width: 95 },
    {
      key: 'actionType',
      header: 'Event',
      width: 100,
      render: (row) => (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            row.actionType === 'SALE'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : row.actionType === 'PURCHASE'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : row.actionType === 'TRANSFER'
              ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              : 'bg-purple-50 text-purple-700 border border-purple-200'
          }`}
        >
          {row.actionType}
        </span>
      ),
    },
    { key: 'details', header: 'Details Description', width: 340 },
    { key: 'user', header: 'User Operator', width: 120 },
  ]

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900">ERP Dashboard</h1>
          <p className="text-[11px] text-gray-500">Live operational overview of diesel inventory status, fleet allocations, and transaction logs.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadDashboardData(true)} className="gap-2">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh View <kbd className="text-[9px] text-gray-400 font-mono ml-1">Ctrl+R</kbd></span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1: Bulk stock volume */}
        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Total Driver Stock</span>
            <p className="text-lg font-black text-gray-800">{FormattingService.formatQuantity(stats.totalStock)}</p>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded">
            <Database size={16} />
          </div>
        </div>

        {/* KPI 2: Stock asset valuation */}
        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Inventory Assets Value</span>
            <p className="text-lg font-black text-blue-600">{FormattingService.formatCurrency(stats.totalValuation * 100)}</p>
          </div>
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded">
            <DollarSign size={16} />
          </div>
        </div>

        {/* KPI 3: Today's Revenue */}
        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Today's Sales Revenue</span>
            <p className="text-lg font-black text-green-600">{FormattingService.formatCurrency(stats.todayRevenueAmt * 100)}</p>
          </div>
          <div className="p-2.5 bg-green-50 text-green-600 rounded">
            <TrendingUp size={16} />
          </div>
        </div>

        {/* KPI 4: Today's Profit */}
        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Today's Margin Profits</span>
            <p className="text-lg font-black text-emerald-700">{FormattingService.formatCurrency(stats.todayProfitAmt * 100)}</p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded">
            <Award size={16} />
          </div>
        </div>
      </div>

      {/* Monthly KPIs & Achievements */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 border p-4 rounded shadow-inner">
        <div className="text-xs space-y-1 border-r pr-4">
          <span className="text-[9px] uppercase font-bold text-gray-400">Month Purchases</span>
          <p className="font-bold text-gray-700">{FormattingService.formatQuantity(stats.monthPurchasesVol)}</p>
        </div>
        <div className="text-xs space-y-1 border-r pr-4">
          <span className="text-[9px] uppercase font-bold text-gray-400">Month Sales Revenue</span>
          <p className="font-bold text-green-700">{FormattingService.formatCurrency(stats.monthRevenueAmt * 100)}</p>
        </div>
        <div className="text-xs space-y-1 border-r pr-4">
          <span className="text-[9px] uppercase font-bold text-gray-400">Top Driver Partner</span>
          <p className="font-bold text-gray-700 truncate">{stats.topDriverName}</p>
        </div>
        <div className="text-xs space-y-1">
          <span className="text-[9px] uppercase font-bold text-gray-400">Top Client Company</span>
          <p className="font-bold text-gray-700 truncate">{stats.topCustomerName}</p>
        </div>
      </div>

      {/* Reusable Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chart 1: Daily sales trend */}
        <div className="bg-white border rounded shadow-subtle p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">7-Day Sales Volume ({quantityAbbreviation})</span>
          </div>
          <SvgChart type="area" data={chartData.dailySales} height={180} color="#22c55e" />
        </div>

        {/* Chart 2: Monthly Trends */}
        <div className="bg-white border rounded shadow-subtle p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">6-Month Sales (Solid) vs Purchase (Dashed)</span>
          </div>
          <SvgChart type="line" data={chartData.monthlyTrends} height={180} color="#3b82f6" secondaryColor="#f59e0b" />
        </div>

        {/* Chart 3: Stock distribution */}
        <div className="bg-white border rounded shadow-subtle p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Driver Stock Distribution</span>
          </div>
          <SvgChart type="donut" data={chartData.stockDistribution} height={180} />
        </div>
      </div>

      {/* Recent Activities & System Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left Column: Recent Activities */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-gray-400" />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Live Transaction Activity Logs</span>
          </div>
          <DataGrid
            columns={columns}
            data={recentLogs}
          />
        </div>

        {/* Right Column: Active Alerts */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 select-none">
            <AlertTriangle size={14} className="text-gray-400" />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Active System Alerts</span>
          </div>

          <div className="border bg-white rounded p-4 space-y-3 max-h-80 overflow-y-auto shadow-subtle">
            {stats.alerts.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-6 select-none">
                No alerts or stock warnings currently active.
              </div>
            ) : (
              stats.alerts.map((al, idx) => (
                <div key={idx} className="flex gap-3 items-start border-b pb-3 last:border-0 last:pb-0 select-none">
                  <div
                    className={`p-1 rounded shrink-0 ${
                      al.type === 'warning'
                        ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-blue-50 text-blue-600 border border-blue-100'
                    }`}
                  >
                    {al.type === 'warning' ? <AlertTriangle size={13} /> : <Activity size={13} />}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-gray-800 leading-none">{al.title}</h4>
                    <p className="text-[10px] text-gray-500 leading-normal">{al.desc}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
