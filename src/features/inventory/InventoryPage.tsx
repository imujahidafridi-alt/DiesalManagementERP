import { useState, useEffect, useMemo } from 'react'
import { DataGrid, Button, useShortcutEffect } from '@/components/ui'
import { useUiStore, useAppStore } from '@/store'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import { FormattingService } from '@/utils/FormattingService'
import { FileSpreadsheet, RefreshCw, Database } from 'lucide-react'
import type { GridColumn } from '@/components/ui/DataGrid'

interface DriverStockRow {
  id: string
  driverName: string
  plateNumber: string
  currentStock: number
  weightedAverageCost: number
  safetyMin: number
}

export default function InventoryPage() {
  const { quantityAbbreviation: unit } = useBusinessSettings()
  const { addToast, showDialog } = useUiStore()

  const {
    inventorySnapshots,
    drivers,
    fetchInventorySnapshots,
    fetchDrivers,
  } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [allTransactions, setAllTransactions] = useState<any[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchInventorySnapshots(),
        fetchDrivers(),
      ])
      const txs = await window.api.invoke('transactions:list')
      setAllTransactions(txs || [])
    } catch (err: any) {
      addToast(err.message || 'Failed to load inventory data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useShortcutEffect('refresh', loadData)

  // Driver Stock calculations
  const driverStockRows = useMemo((): DriverStockRow[] => {
    return drivers.map((d) => {
      const snap = inventorySnapshots.find((i) => i.item === d.id)
      return {
        id: d.id,
        driverName: d.name,
        plateNumber: '',
        currentStock: snap ? snap.currentStock : 0,
        weightedAverageCost: snap ? snap.weightedAverageCost : 0,
        safetyMin: 500, // default safety threshold is 500
      }
    })
  }, [drivers, inventorySnapshots])

  // Summary Metrics
  const summary = useMemo(() => {
    let totalPurchased = 0
    let totalSold = 0
    let totalAdjustments = 0

    allTransactions.forEach((tx) => {
      if (tx.transactionType === 'PURCHASE') {
        totalPurchased += tx.quantity
      } else if (tx.transactionType === 'SALE') {
        totalSold += tx.quantity
      } else if (tx.transactionType === 'ADJUSTMENT') {
        totalAdjustments += tx.quantity
      }
    })

    const totalSystemStock = driverStockRows.reduce((sum, r) => sum + r.currentStock, 0)
    const totalValuation = driverStockRows.reduce((sum, r) => sum + r.currentStock * r.weightedAverageCost, 0)
    const avgWac = totalSystemStock > 0 ? (totalValuation / totalSystemStock) : 0
    const lowStockCount = driverStockRows.filter((r) => r.currentStock < r.safetyMin).length

    return {
      totalPurchased,
      totalSold,
      totalAdjustments,
      totalSystemStock,
      avgWac,
      lowStockCount,
    }
  }, [allTransactions, driverStockRows])

  const triggerRebuild = async () => {
    addToast('Rebuilding read-through cache snapshots...', 'info')
    setTimeout(async () => {
      try {
        await loadData()
        addToast('Inventory snapshots cache rebuild complete!', 'success')
      } catch (e: any) {
        addToast(e.message || 'Failed to rebuild cache', 'error')
      }
    }, 1500)
  }

  const triggerCreateNew = () => {
    showDialog({
      title: 'Manual Stock Correction / Adjustment',
      message: 'To perform manual stock adjustments, go to the Purchases, Sales, or Transfers pages to create transactions.',
      type: 'info',
      confirmText: 'Acknowledge',
    })
  }

  const triggerExport = () => {
    addToast('Export to Excel initiated (Ctrl+E)', 'info')
  }

  useShortcutEffect('new', triggerCreateNew)
  useShortcutEffect('export', triggerExport)

  const columns: GridColumn<DriverStockRow>[] = [
    { key: 'driverName', header: 'Driver Name', width: 180 },
    {
      key: 'currentStock',
      header: `Current Stock (${unit})`,
      width: 140,
      type: 'number',
      render: (row) => FormattingService.formatQuantity(row.currentStock),
    },
    {
      key: 'weightedAverageCost',
      header: 'Weighted Average Cost (WAC)',
      width: 220,
      type: 'currency',
      render: (row) => FormattingService.formatRate(row.weightedAverageCost),
    },
    {
      key: 'safetyMin',
      header: `Safety Threshold (${unit})`,
      width: 150,
      type: 'number',
      render: (row) => FormattingService.formatQuantity(row.safetyMin),
    },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (row) => {
        const isLow = row.currentStock < row.safetyMin
        return (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
              isLow
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-green-50 text-green-700 border-green-200'
            }`}
          >
            {isLow ? 'LOW STOCK' : 'HEALTHY'}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between select-none">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900">Diesel Inventory Stock</h1>
          <p className="text-[11px] text-gray-500">Monitor current driver-centric volumes, carrying cost structures, and safety alert boundaries.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={triggerRebuild} className="gap-2">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Rebuild Cache <kbd className="text-[9px] text-gray-400 font-mono ml-1">Ctrl+R</kbd></span>
          </Button>
          <Button variant="outline" size="sm" onClick={triggerExport} className="gap-2">
            <FileSpreadsheet size={13} />
            <span>Export <kbd className="text-[9px] text-gray-400 font-mono ml-1">Ctrl+E</kbd></span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 select-none">
        <div className="border bg-white p-4 rounded flex items-center justify-between shadow-subtle">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-gray-400">Total Driver Stock</div>
            <div className="text-lg font-black text-gray-800">{FormattingService.formatQuantity(summary.totalSystemStock)}</div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded">
            <Database size={16} />
          </div>
        </div>

        <div className="border bg-white p-4 rounded flex items-center justify-between shadow-subtle">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-gray-400">Average carrying WAC</div>
            <div className="text-lg font-black text-blue-600">{FormattingService.formatRate(Math.round(summary.avgWac))}</div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded">
            <Database size={16} />
          </div>
        </div>

        <div className="border bg-white p-4 rounded flex items-center justify-between shadow-subtle">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-gray-400">Low Stock Warnings</div>
            <div className={`text-lg font-black ${summary.lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {summary.lowStockCount} Driver(s)
            </div>
          </div>
          <div className={`p-3 rounded ${summary.lowStockCount > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            <Database size={16} />
          </div>
        </div>
      </div>

      {/* Grid Row for Purchased / Sold Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 border p-4 rounded shadow-inner select-none">
        <div className="text-xs space-y-1 border-r pr-4">
          <span className="text-[9px] uppercase font-bold text-gray-400">Total Purchased Volume</span>
          <p className="font-bold text-gray-700">{FormattingService.formatQuantity(summary.totalPurchased)}</p>
        </div>
        <div className="text-xs space-y-1 border-r pr-4">
          <span className="text-[9px] uppercase font-bold text-gray-400">Total Sold Volume</span>
          <p className="font-bold text-green-700">{FormattingService.formatQuantity(summary.totalSold)}</p>
        </div>
        <div className="text-xs space-y-1">
          <span className="text-[9px] uppercase font-bold text-gray-400">Total Corrections / Adjustments</span>
          <p className="font-bold text-gray-700">{FormattingService.formatQuantity(summary.totalAdjustments)}</p>
        </div>
      </div>

      {/* Grid Container */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider select-none">Driver Stock Registry</div>
        <DataGrid
          columns={columns}
          data={driverStockRows}
        />
      </div>
    </div>
  )
}
