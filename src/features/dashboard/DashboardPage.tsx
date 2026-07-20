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
    fetchInventorySnapshots,
    fetchDrivers,
    fetchCustomers,
    fetchSuppliers,
    suppliers,
    customers,
  } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [chartData, setChartData] = useState<any>(null)
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])

  const loadDashboardData = async (isManual = false) => {
    setLoading(true)
    try {
      // Load static caches first for UI lookup mapping
      await Promise.all([
        fetchInventorySnapshots(),
        fetchDrivers(),
        fetchCustomers(),
        fetchSuppliers(),
      ])

      const res = await window.api.invoke('reports:getDashboardData')
      setStats(res.stats)
      setChartData(res.chartData)
      setRecentTransactions(res.recentTransactions || [])
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

  // Recent Activity logs mapped from raw recentTransactions
  const recentLogs = useMemo(() => {
    return recentTransactions.map((tx) => {
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
  }, [recentTransactions, suppliers, customers])

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

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 font-medium text-xs bg-slate-50/50 rounded-lg border border-dashed select-none">
        <RefreshCw className="animate-spin mb-2 text-slate-400" size={20} />
        <span>Loading Sahara Dashboard Insights...</span>
      </div>
    )
  }

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
            <p className={`text-lg font-black ${stats.totalStock < 0 ? 'text-red-600 flex items-center gap-1.5' : 'text-gray-800'}`}>
              {stats.totalStock < 0 && <span title="Negative overall stock">🔴</span>}
              {FormattingService.formatQuantity(stats.totalStock)}
            </p>
          </div>
          <div className={`p-2.5 rounded ${stats.totalStock < 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
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
              stats.alerts.map((al: any, idx: number) => (
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
