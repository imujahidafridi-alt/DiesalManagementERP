import { useState, useEffect, useMemo, useRef } from 'react'
import { DataGrid, Button, useShortcutEffect, Select } from '@/components/ui'
import { useUiStore, useAppStore } from '@/store'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import { FormattingService } from '@/utils/FormattingService'
import { FileSpreadsheet, RefreshCw, Database, Plus, Save } from 'lucide-react'
import type { GridColumn } from '@/components/ui/DataGrid'

interface DriverStockRow {
  id: string
  driverName: string
  plateNumber: string
  currentStock: number
  weightedAverageCost: number
}

export default function InventoryPage() {
  const { quantityAbbreviation: unit } = useBusinessSettings()
  const { addToast } = useUiStore()

  const {
    inventorySnapshots,
    drivers,
    fetchInventorySnapshots,
    fetchDrivers,
    createAdjustment,
  } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [allTransactions, setAllTransactions] = useState<any[]>([])

  // Adjustment form states
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toLocaleDateString('en-CA'),
    driverId: '',
    adjustmentType: 'INCREASE' as 'INCREASE' | 'DECREASE',
    quantity: '',
    notes: '',
  })
  const [formErrors, setFormErrors] = useState<Partial<Record<string, string>>>({})

  // Form input refs for focus traversal
  const refDate = useRef<HTMLInputElement>(null)
  const refDriver = useRef<HTMLDivElement>(null)
  const refType = useRef<HTMLDivElement>(null)
  const refQty = useRef<HTMLInputElement>(null)
  const refNotes = useRef<HTMLInputElement>(null)

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

    return {
      totalPurchased,
      totalSold,
      totalAdjustments,
      totalSystemStock,
      avgWac,
    }
  }, [allTransactions, driverStockRows])

  const driverOptions = useMemo(() => {
    return drivers
      .filter((d) => d.status === 'ACTIVE')
      .map((d) => ({
        value: d.id,
        label: d.name,
      }))
  }, [drivers])

  const handleCancel = () => {
    setIsAdjusting(false)
    setFormData({
      date: new Date().toLocaleDateString('en-CA'),
      driverId: '',
      adjustmentType: 'INCREASE',
      quantity: '',
      notes: '',
    })
    setFormErrors({})
  }

  const triggerCreateNew = () => {
    setIsAdjusting(true)
    setTimeout(() => refDate.current?.focus(), 50)
  }

  const handleSubmit = async () => {
    if (!isAdjusting) return
    const errors: Partial<Record<string, string>> = {}
    if (!formData.date) errors.date = 'Date is required'
    if (!formData.driverId) errors.driverId = 'Please select a driver'
    const qty = parseFloat(formData.quantity)
    if (isNaN(qty) || qty <= 0) {
      errors.quantity = 'Quantity must be greater than 0'
    } else {
      if (formData.adjustmentType === 'DECREASE') {
        const driverRow = driverStockRows.find((r) => r.id === formData.driverId)
        const currentStock = driverRow ? driverRow.currentStock : 0
        if (qty > currentStock) {
          errors.quantity = `Insufficient stock to adjust. Available: ${FormattingService.formatQuantity(currentStock)}`
        }
      }
    }
    if (!formData.notes || formData.notes.trim() === '') {
      errors.notes = 'Reason for adjustment is mandatory'
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      addToast('Please resolve validation errors before saving', 'error')
      return
    }

    try {
      await createAdjustment({
        locationId: formData.driverId,
        locationType: 'DRIVER',
        adjustmentType: formData.adjustmentType,
        quantity: qty,
        notes: formData.notes,
        transactionDate: formData.date,
      })
      addToast('Inventory adjustment processed successfully', 'success')
      handleCancel()
      loadData()
    } catch (err: any) {
      addToast(err.message || 'Error creating adjustment', 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'date') {
        refDriver.current?.focus()
      } else if (field === 'driverId') {
        refType.current?.focus()
      } else if (field === 'adjustmentType') {
        refQty.current?.focus()
      } else if (field === 'quantity') {
        refNotes.current?.focus()
      } else if (field === 'notes') {
        handleSubmit()
      }
    }
  }

  const triggerRebuild = async () => {
    addToast('Rebuilding read-through cache snapshots...', 'info')
    try {
      await Promise.all(
        drivers.map((d) => window.api.invoke('inventory:rebuildSnapshot', d.id))
      )
      await loadData()
      addToast('Inventory snapshots cache rebuild complete!', 'success')
    } catch (e: any) {
      addToast(e.message || 'Failed to rebuild cache', 'error')
    }
  }

  const triggerExport = () => {
    addToast('Export to Excel initiated (Ctrl+E)', 'info')
  }

  useShortcutEffect('new', triggerCreateNew)
  useShortcutEffect('export', triggerExport)
  useShortcutEffect('save', () => {
    if (isAdjusting) handleSubmit()
  })
  useShortcutEffect('escape', () => {
    if (isAdjusting) handleCancel()
  })

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
  ]

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between select-none">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900">Diesel Inventory Stock</h1>
          <p className="text-[11px] text-gray-500">Monitor current driver-centric volumes and carrying cost structures.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={triggerCreateNew} className="gap-2" disabled={isAdjusting}>
            <Plus size={13} />
            <span>Post Adjustment <kbd className="text-[9px] text-gray-400 font-mono ml-1">Ctrl+N</kbd></span>
          </Button>
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

      {/* 2. Manual Stock Adjustment Form Grid */}
      {isAdjusting && (
        <div className="border bg-white rounded shadow-md p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Manual Stock Adjustment / Correction Form
            </span>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel [Esc]
            </Button>
          </div>

          <div className="grid grid-cols-5 gap-3 select-none">
            {/* Cell 1: Date */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Adjustment Date</label>
              <input
                ref={refDate}
                type="date"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.date ? 'border-red-400' : 'border-gray-300'}`}
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'date')}
              />
              {formErrors.date && <p className="text-[9px] text-red-500 font-bold">{formErrors.date}</p>}
            </div>

            {/* Cell 2: Driver / Location */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Driver / Location</label>
              <Select
                ref={refDriver}
                error={formErrors.driverId}
                value={formData.driverId}
                onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'driverId')}
                options={driverOptions}
              />
            </div>

            {/* Cell 3: Adjustment Type */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Adjustment Type</label>
              <Select
                ref={refType}
                error={formErrors.adjustmentType}
                value={formData.adjustmentType}
                onChange={(e) => setFormData({ ...formData, adjustmentType: e.target.value as 'INCREASE' | 'DECREASE' })}
                onKeyDown={(e) => handleKeyDown(e, 'adjustmentType')}
                options={[
                  { value: 'INCREASE', label: 'INCREASE (+) STOCK' },
                  { value: 'DECREASE', label: 'DECREASE (-) STOCK' },
                ]}
              />
            </div>

            {/* Cell 4: Quantity */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Quantity ({unit})</label>
              <input
                ref={refQty}
                type="number"
                step="any"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.quantity ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="0.00"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'quantity')}
              />
              {formErrors.quantity && <p className="text-[9px] text-red-500 font-bold">{formErrors.quantity}</p>}
            </div>

            {/* Cell 5: Notes */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Reason / Notes (Mandatory)</label>
              <input
                ref={refNotes}
                type="text"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.notes ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="E.g. physical stock dip count correction..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'notes')}
              />
              {formErrors.notes && <p className="text-[9px] text-red-500 font-bold">{formErrors.notes}</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t select-none">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} className="gap-2">
              <Save size={13} />
              <span>Save Adjustment <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+S</kbd></span>
            </Button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 select-none">
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
