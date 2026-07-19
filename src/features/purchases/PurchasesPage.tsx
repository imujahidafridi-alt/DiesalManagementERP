import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore, useUiStore } from '@/store'
import { usePaginatedGrid } from '@/hooks/usePaginatedGrid'
import { appConfig } from '@/config/appConfig'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import { FormattingService } from '@/utils/FormattingService'
import {
  Button,
  Combobox,
  DataGrid,
  useShortcutEffect,
} from '@/components/ui'
import InventoryConflictDialog from '@/components/ui/InventoryConflictDialog'
import type { StockConflict } from '@/database/services/TransactionService'
import type { GridColumn } from '@/components/ui/DataGrid'
import {
  Plus,
  Save,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  FileSpreadsheet,
  Printer,
  ShoppingBag,
  Coins,
  Database,
} from 'lucide-react'

interface PurchaseFormData {
  date: string
  supplierId: string
  destinationLocation: string
  referenceNumber: string
  quantity: string
  unitCostDollars: string
  notes: string
}

const emptyForm: PurchaseFormData = {
  date: new Date().toLocaleDateString('en-CA'),
  supplierId: '',
  destinationLocation: 'Main Tank A',
  referenceNumber: '',
  quantity: '',
  unitCostDollars: '',
  notes: '',
}

export default function PurchasesPage() {
  // --- 1. Zustand State & Actions ---
  const {
    suppliers,
    fetchSuppliers,
    fetchInventorySnapshots,
    createPurchase,
    updatePurchase,
    deletePurchase,
    dbConnected,
    createSupplier,
    drivers,
    fetchDrivers,
  } = useAppStore()

  const { addToast, showDialog } = useUiStore()
  const { currencySymbol: symbol, quantityAbbreviation: unit } = useBusinessSettings()

  // --- 2. Paginated Grid Hook ---
  const grid = usePaginatedGrid('purchases')

  // --- 3. Form & Edit State ---
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formData, setFormData] = useState<PurchaseFormData>(emptyForm)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof PurchaseFormData, string>>>({})
  const [selectedTxRow, setSelectedTxRow] = useState<any | null>(null)

  // Conflict dialog state
  const [conflictOpen, setConflictOpen] = useState(false)
  const [stockConflicts, setStockConflicts] = useState<StockConflict[]>([])
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null)

  // Input refs for keyboard tab/enter traversal
  const refDate = useRef<HTMLInputElement>(null)
  const refSupplier = useRef<HTMLDivElement>(null)
  const refDriver = useRef<HTMLDivElement>(null)
  const refRefNum = useRef<HTMLInputElement>(null)
  const refQty = useRef<HTMLInputElement>(null)
  const refRate = useRef<HTMLInputElement>(null)
  const refNotes = useRef<HTMLInputElement>(null)

  const { activeLookupId, setActiveLookupId } = useUiStore()

  useEffect(() => {
    // Force cached lookups if empty
    fetchSuppliers()
    fetchInventorySnapshots()
    fetchDrivers()
  }, [])

  // Lookup detection: direct DB query by ID to open edit form automatically
  useEffect(() => {
    const checkLookup = async () => {
      if (activeLookupId) {
        try {
          const match = await window.api.invoke('transactions:getById', activeLookupId)
          if (match) {
            setSelectedTxRow(match)
            handleEdit(match)
            setActiveLookupId(null)
          }
        } catch (e) {
          console.error('Error looking up transaction', e)
        }
      }
    }
    checkLookup()
  }, [activeLookupId])

  // --- 4. Purchases Summary Stats from Database ---
  const [summary, setSummary] = useState({
    todayQty: 0,
    todayTotal: 0,
    monthQty: 0,
    monthTotal: 0,
    totalQty: 0,
    avgRate: 0,
    totalTransactions: 0,
  })

  const loadSummary = async () => {
    try {
      const stats = await window.api.invoke('reports:getPurchasesSummary')
      setSummary(stats)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [grid.data])

  // --- 5. UI Calculations (Derived) ---
  const totalAmountDollars = useMemo(() => {
    const qty = parseFloat(formData.quantity) || 0
    const rate = parseFloat(formData.unitCostDollars) || 0
    return (qty * rate).toFixed(2)
  }, [formData.quantity, formData.unitCostDollars])

  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.companyName,
    }))
  }, [suppliers])

  const driverOptions = useMemo(() => {
    return drivers
      .filter((d) => d.status === 'ACTIVE')
      .map((d) => ({
        value: d.id,
        label: d.name,
      }))
  }, [drivers])

  // --- 4. Keyboard Traversal Handler ---
  const handleFormKeyDown = (e: React.KeyboardEvent, currentField: keyof PurchaseFormData) => {
    if (e.key === 'Enter') {
      // Do not let Enter skip any required field.
      if (currentField === 'date' && !formData.date) return
      if (currentField === 'supplierId' && !formData.supplierId) return
      if (currentField === 'destinationLocation' && !formData.destinationLocation) return
      if (currentField === 'quantity' && !formData.quantity) return
      if (currentField === 'unitCostDollars' && !formData.unitCostDollars) return

      e.preventDefault()
      if (currentField === 'date') {
        refSupplier.current?.focus()
      } else if (currentField === 'supplierId') {
        refDriver.current?.focus()
      } else if (currentField === 'destinationLocation') {
        refRefNum.current?.focus()
      } else if (currentField === 'referenceNumber') {
        refQty.current?.focus()
      } else if (currentField === 'quantity') {
        refRate.current?.focus()
      } else if (currentField === 'unitCostDollars') {
        refNotes.current?.focus()
      } else if (currentField === 'notes') {
        handleSubmit()
      }
    }
  }

  // --- 5. Form Actions ---
  const handleNew = () => {
    setFormData({
      ...emptyForm,
      date: new Date().toLocaleDateString('en-CA'),
    })
    setFormErrors({})
    setEditId(null)
    setIsEditing(true)
    addToast('Ready for new purchase entry. Keyboard focus set.', 'info')
    setTimeout(() => refDate.current?.focus(), 50)
  }

  const handleEdit = (tx?: any) => {
    const row = tx || selectedTxRow
    if (!row) {
      addToast('Please select a purchase transaction to edit first', 'error')
      return
    }

    setFormData({
      date: row.transactionDate,
      supplierId: row.sourceId,
      destinationLocation: row.destinationId,
      referenceNumber: row.referenceNumber || '',
      quantity: String(row.quantity),
      unitCostDollars: String((row.unitCost / 100).toFixed(2)),
      notes: row.notes || '',
    })
    setFormErrors({})
    setEditId(row.id)
    setIsEditing(true)
    addToast(`Loaded ${row.transactionNumber} for editing.`, 'info')
    setTimeout(() => refQty.current?.focus(), 50)
  }

  const handleDelete = () => {
    if (!selectedTxRow) {
      addToast('Select a purchase row to delete', 'error')
      return
    }

    showDialog({
      title: 'Soft-Delete Purchase Record',
      message: `Are you sure you want to soft-delete purchase invoice "${selectedTxRow.transactionNumber}"? This will automatically restore the original stock levels and recalculate the carrying WAC cost snapshots chronologically.`,
      type: 'delete',
      confirmText: 'Soft Delete',
      onConfirm: async () => {
        const result = await deletePurchase(selectedTxRow.id)
        if (result.success) {
          addToast('Purchase transaction soft-deleted and inventory recalculated.', 'success')
          setSelectedTxRow(null)
          grid.reload()
          loadSummary()
        } else {
          setStockConflicts(result.conflicts)
          setPendingRetry(() => handleDelete)
          setConflictOpen(true)
        }
      },
    })
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData(emptyForm)
    setFormErrors({})
    setEditId(null)
    addToast('Editing discarded', 'info')
  }

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof PurchaseFormData, string>> = {}

    if (!formData.date) errors.date = 'Date is required'
    if (!formData.supplierId) errors.supplierId = 'Please select a supplier'
    if (!formData.destinationLocation) errors.destinationLocation = 'Select a driver'
    if (!formData.referenceNumber) errors.referenceNumber = 'Vehicle number is required'

    const qty = parseFloat(formData.quantity)
    if (isNaN(qty) || qty <= 0) {
      errors.quantity = `Quantity must be greater than 0 ${unit}`
    }

    const rate = parseFloat(formData.unitCostDollars)
    if (isNaN(rate) || rate <= 0) {
      errors.unitCostDollars = `Purchase Rate must be greater than 0 ${symbol}`
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateSupplier = async (name: string) => {
    try {
      const newSup = await createSupplier({
        companyName: name,
        contactPerson: 'Auto Registered',
        phone: '',
        address: '',
        notes: 'Automatically registered during purchase invoice creation',
      })
      setFormData((prev) => ({ ...prev, supplierId: newSup.id }))
      addToast(`Supplier "${name}" auto-registered successfully`, 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to auto-register supplier', 'error')
    }
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      addToast('Please resolve validation errors before saving', 'error')
      return
    }

    try {
      const submissionData = {
        supplierId: formData.supplierId,
        destinationLocation: formData.destinationLocation,
        quantity: parseFloat(formData.quantity),
        unitCost: Math.round(parseFloat(formData.unitCostDollars) * 100),
        referenceNumber: formData.referenceNumber || undefined,
        transactionDate: formData.date,
        notes: formData.notes || undefined,
      }

      if (editId) {
        const result = await updatePurchase(editId, submissionData)
        if (!result.success) {
          setStockConflicts(result.conflicts)
          setPendingRetry(() => handleSubmit)
          setConflictOpen(true)
          return
        }
        addToast('Purchase record updated and retroactively recalculated', 'success')
      } else {
        const res = await createPurchase(submissionData)
        addToast(`Purchase ${res.transactionNumber} created successfully`, 'success')
      }

      setIsEditing(false)
      setFormData(emptyForm)
      setEditId(null)
      setSelectedTxRow(null)
      grid.reload()
      loadSummary()
    } catch (err: any) {
      addToast(err.message || 'Database error processing purchase', 'error')
    }
  }

  const handleRefresh = async () => {
    grid.reload()
    loadSummary()
    await fetchInventorySnapshots(true)
    await fetchSuppliers(true)
    addToast('Data refreshed successfully', 'success')
  }

  // --- 6. Global Keyboard Shortcuts ---
  useShortcutEffect('new', handleNew)
  useShortcutEffect('save', () => {
    if (isEditing) handleSubmit()
  })
  useShortcutEffect('escape', () => {
    if (isEditing) handleCancel()
  })
  useShortcutEffect('refresh', handleRefresh)

  // Listen to Delete key or F2 key manually for rows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return

      if (e.key === 'Delete') {
        handleDelete()
      } else if (e.key === 'F2' && selectedTxRow) {
        handleEdit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedTxRow, isEditing])

  // --- 7. Column Configuration for History Table ---
  const columns = useMemo((): GridColumn<any>[] => {
    return [
      { key: 'transactionNumber', header: 'Invoice No', width: 95 },
      { key: 'transactionDate', header: 'Date', width: 90 },
      {
        key: 'supplier',
        header: 'Supplier',
        width: 140,
        render: (row) => suppliers.find((s) => s.id === row.sourceId)?.companyName || 'Unknown Supplier',
      },
      {
        key: 'driver',
        header: 'Driver',
        width: 130,
        render: (row) => drivers.find((d) => d.id === row.destinationId)?.name || 'Unknown Driver',
      },
      { key: 'referenceNumber', header: 'Vehicle Number', width: 110 },
      { key: 'quantity', header: `Volume (${unit})`, width: 100, type: 'number' },
      { key: 'unitCost', header: 'Unit Cost', width: 90, type: 'currency' },
      {
        key: 'total',
        header: 'Total Cost',
        width: 110,
        render: (row) => FormattingService.formatCurrency(row.quantity * row.unitCost),
      },
      { key: 'averageCostSnapshot', header: `Carrying WAC/${unit}`, width: 110, type: 'currency' },
      {
        key: 'status',
        header: 'Status',
        width: 80,
        render: () => (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 border border-green-200 text-green-700">
            COMPLETED
          </span>
        ),
      },
    ]
  }, [suppliers, drivers, symbol, unit])

  return (
    <>
    <div className="space-y-4">
      {/* 1. Purchase Entry Toolbar */}
      <div className="flex items-center justify-between border-b pb-3 select-none bg-white p-3.5 rounded border shadow-subtle">
        <div className="flex items-center gap-2">
          <Button
            variant={isEditing && !editId ? 'primary' : 'outline'}
            size="sm"
            onClick={handleNew}
            disabled={isEditing && !editId}
            className="gap-2"
          >
            <Plus size={13} />
            <span>New Purchase <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+N</kbd></span>
          </Button>

          <Button
            variant={isEditing ? 'primary' : 'outline'}
            size="sm"
            onClick={handleSubmit}
            disabled={!isEditing}
            className="gap-2"
          >
            <Save size={13} />
            <span>Save <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+S</kbd></span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEdit()}
            disabled={isEditing || !selectedTxRow}
            className="gap-2"
          >
            <Edit size={13} />
            <span>Edit <kbd className="text-[10px] font-mono opacity-60 ml-1">F2</kbd></span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isEditing || !selectedTxRow}
            className="gap-2 text-red-600 hover:text-red-700"
          >
            <Trash2 size={13} />
            <span>Delete <kbd className="text-[10px] font-mono opacity-60 ml-1">Del</kbd></span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw size={13} className={grid.loading ? 'animate-spin' : ''} />
            <span>Refresh <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+R</kbd></span>
          </Button>
        </div>

        {/* Global Toolbar Action Placeholders & Quick Search */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs border-r pr-4">
            <Button variant="outline" size="sm" disabled className="gap-1">
              <FileSpreadsheet size={13} />
              <span>Export</span>
            </Button>
            <Button variant="outline" size="sm" disabled className="gap-1">
              <Printer size={13} />
              <span>Print</span>
            </Button>
          </div>

          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search purchases..."
              className="w-full pl-8 pr-3 py-1 bg-gray-50 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={grid.search}
              onChange={(e) => grid.setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2. Excel-like Entry Grid */}
      {isEditing && (
        <div className="border bg-white rounded shadow-md p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              {editId ? `Editing Purchase: ${selectedTxRow?.transactionNumber}` : 'New Purchase Invoice Entry Grid'}
            </span>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel [Esc]
            </Button>
          </div>

          {/* Grid fields */}
          <div className="grid grid-cols-7 gap-3 select-none">
            {/* Cell 1: Date */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Date</label>
              <div className="relative">
                <input
                  ref={refDate}
                  type="date"
                  className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.date ? 'border-red-400' : 'border-gray-300'
                    }`}
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  onKeyDown={(e) => handleFormKeyDown(e, 'date')}
                />
              </div>
              {formErrors.date && <p className="text-[9px] text-red-500 font-bold">{formErrors.date}</p>}
            </div>

            {/* Cell 2: Supplier lookup */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Supplier</label>
              <Combobox
                ref={refSupplier}
                options={supplierOptions}
                value={formData.supplierId}
                onChange={(val) => setFormData({ ...formData, supplierId: val })}
                onSelect={() => refDriver.current?.focus()}
                placeholder="Lookup Supplier..."
                error={formErrors.supplierId}
                onCreateCustom={handleCreateSupplier}
              />
            </div>

            {/* Cell 3: Driver Destination */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Driver</label>
              <Combobox
                ref={refDriver}
                options={driverOptions}
                value={formData.destinationLocation}
                onChange={(val) => setFormData({ ...formData, destinationLocation: val })}
                onSelect={() => refRefNum.current?.focus()}
                placeholder="Select Driver..."
                error={formErrors.destinationLocation}
              />
            </div>

            {/* Cell 4: Vehicle Number */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Vehicle Number</label>
              <input
                ref={refRefNum}
                type="text"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.referenceNumber ? 'border-red-400' : 'border-gray-300'
                  }`}
                placeholder="e.g. TN-4587"
                value={formData.referenceNumber}
                onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                onKeyDown={(e) => handleFormKeyDown(e, 'referenceNumber')}
              />
              {formErrors.referenceNumber && <p className="text-[9px] text-red-500 font-bold">{formErrors.referenceNumber}</p>}
            </div>

            {/* Cell 5: Quantity */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Volume ({unit})</label>
              <input
                ref={refQty}
                type="number"
                step="any"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.quantity ? 'border-red-400' : 'border-gray-300'
                  }`}
                placeholder="0.00"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                onKeyDown={(e) => handleFormKeyDown(e, 'quantity')}
              />
              {formErrors.quantity && <p className="text-[9px] text-red-500 font-bold">{formErrors.quantity}</p>}
            </div>

            {/* Cell 6: Purchase rate */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Cost Rate ({symbol}/{unit})</label>
              <input
                ref={refRate}
                type="number"
                step="0.01"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.unitCostDollars ? 'border-red-400' : 'border-gray-300'
                  }`}
                placeholder="0.00"
                value={formData.unitCostDollars}
                onChange={(e) => setFormData({ ...formData, unitCostDollars: e.target.value })}
                onKeyDown={(e) => handleFormKeyDown(e, 'unitCostDollars')}
              />
              {formErrors.unitCostDollars && <p className="text-[9px] text-red-500 font-bold">{formErrors.unitCostDollars}</p>}
            </div>

            {/* Cell 7: Total cost */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Total Amount</label>
              <div className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded text-gray-700 font-bold font-mono">
                {FormattingService.formatCurrency(parseFloat(totalAmountDollars) * 100)}
              </div>
            </div>
          </div>

          {/* Remarks Notes cell */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase">Ledger Remarks / Notes</label>
            <input
              ref={refNotes}
              type="text"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Write internal audit memo notes..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              onKeyDown={(e) => handleFormKeyDown(e, 'notes')}
            />
          </div>
        </div>
      )}

      {/* 3. Purchase Summary Panel */}
      <div className="grid grid-cols-6 gap-4 select-none">
        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Today's Volume</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatQuantity(summary.todayQty)}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded">
            <ShoppingBag size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Today's Purchases</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatCurrency(summary.todayTotal * 100)}</p>
          </div>
          <div className="p-2 bg-green-50 text-green-600 rounded">
            <Coins size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">This Month Purchases</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatCurrency(summary.monthTotal * 100)}</p>
          </div>
          <div className="p-2 bg-green-50 text-green-600 rounded">
            <Coins size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Weighted Average Cost</span>
            <p className="text-sm font-bold text-blue-600">{FormattingService.formatRate(Math.round(summary.avgRate * 100))}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded">
            <Database size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Total Volume Purchased</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatQuantity(summary.totalQty)}</p>
          </div>
          <div className="p-2 bg-gray-50 text-gray-600 rounded">
            <Database size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Purchase Transactions</span>
            <p className="text-sm font-bold text-gray-800">{summary.totalTransactions} Operations</p>
          </div>
          <div className="p-2 bg-gray-50 text-gray-600 rounded">
            <ShoppingBag size={14} />
          </div>
        </div>
      </div>

      {/* 4. Recent Purchases Grid */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider select-none">
          Chronological Purchase Transactions History
        </div>
        <DataGrid
          columns={columns}
          data={grid.data}
          pagination={{
            currentPage: grid.page,
            pageSize: grid.pageSize,
            totalCount: grid.totalCount,
            onPageChange: grid.handlePageChange,
            onPageSizeChange: grid.handlePageSizeChange,
          }}
          onSelectionChange={(selected) => {
            if (selected.length > 0) {
              setSelectedTxRow(selected[0])
            } else {
              setSelectedTxRow(null)
            }
          }}
          onCellEditSubmit={(rowIndex, key, value) => {
            const row = grid.data[rowIndex]
            if (!row) return

            // Convert to dollar representation to match form layout edit helpers
            const mappedRow = {
              supplierId: key === 'supplier' ? value : row.sourceId,
              destinationLocation: key === 'driver' ? value : row.destinationId,
              quantity: key === 'quantity' ? parseFloat(value) : row.quantity,
              unitCost: key === 'unitCost' ? Math.round(parseFloat(value) * 100) : row.unitCost,
              referenceNumber: key === 'referenceNumber' ? value : (row.referenceNumber || undefined),
              transactionDate: key === 'transactionDate' ? value : row.transactionDate,
              notes: key === 'notes' ? value : (row.notes || undefined),
            }

            showDialog({
              title: 'Fast Inline Cell Edit',
              message: `You edited "${key}" cell. Are you sure you want to save this change and trigger retroactive WAC/profit calculations across the transaction ledger?`,
              type: 'confirm',
              confirmText: 'Commit Edit',
              onConfirm: async () => {
                try {
                  await updatePurchase(row.id, mappedRow)
                  addToast('Inline cell changes committed successfully', 'success')
                  grid.reload()
                  loadSummary()
                } catch (err: any) {
                  addToast(err.message || 'Cell edit error', 'error')
                }
              },
            })
          }}
        />
      </div>

      {/* 5. Status Bar */}
      <div className="border-t pt-2 flex items-center justify-between text-[10px] text-gray-400 font-mono select-none">
        <div className="flex items-center gap-4">
          <span>DATABASE: {dbConnected ? 'SQLITE_ONLINE' : 'SQLITE_OFFLINE'}</span>
        </div>
        <div>
          <span>Sahara Diesels {appConfig.version}</span>
        </div>
      </div>
    </div>

    <InventoryConflictDialog
      isOpen={conflictOpen}
      conflicts={stockConflicts}
      onClose={() => { setConflictOpen(false); setStockConflicts([]) }}
      onValidateAgain={pendingRetry ? () => {
        setConflictOpen(false)
        setStockConflicts([])
        pendingRetry()
      } : undefined}
    />
    </>
  )
}
