import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore, useUiStore } from '@/store'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import { FormattingService } from '@/utils/FormattingService'
import {
  Button,
  DataGrid,
  useShortcutEffect,
  Combobox,
} from '@/components/ui'
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
  TrendingUp,
  Database,
} from 'lucide-react'

interface SaleFormData {
  date: string
  customerId: string
  driverId: string
  quantity: string
  sellingRateDollars: string
  referenceNumber: string
  notes: string
}

const emptyForm: SaleFormData = {
  date: new Date().toISOString().slice(0, 10),
  customerId: '',
  driverId: '',
  quantity: '',
  sellingRateDollars: '',
  referenceNumber: '',
  notes: '',
}

export default function SalesPage() {
  const {
    sales,
    customers,
    drivers,
    inventorySnapshots,
    fetchSales,
    fetchCustomers,
    fetchDrivers,
    fetchInventorySnapshots,
    createSale,
    updateSale,
    deleteSale,
    currentOperator,
    dbConnected,
    createCustomer,
  } = useAppStore()

  const { addToast, showDialog } = useUiStore()

  const { currencySymbol: symbol, quantityAbbreviation: unit } = useBusinessSettings()

  // Local UI states
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formData, setFormData] = useState<SaleFormData>(emptyForm)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof SaleFormData, string>>>({})
  const [selectedTxRow, setSelectedTxRow] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Traversals
  const refDate = useRef<HTMLInputElement>(null)
  const refDriver = useRef<HTMLSelectElement>(null)
  const refQty = useRef<HTMLInputElement>(null)
  const refRate = useRef<HTMLInputElement>(null)
  const refRefNum = useRef<HTMLInputElement>(null)
  const refNotes = useRef<HTMLInputElement>(null)

  // Load datasets
  const loadData = async () => {
    try {
      await Promise.all([
        fetchSales(),
        fetchCustomers(),
        fetchDrivers(),
        fetchInventorySnapshots(),
      ])
    } catch (err) {
      console.error(err)
    }
  }

  const { activeLookupId, setActiveLookupId } = useUiStore()

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeLookupId && sales.length > 0) {
      const match = sales.find((s) => s.id === activeLookupId)
      if (match) {
        setSelectedTxRow(match)
        setActiveLookupId(null)
      }
    }
  }, [activeLookupId, sales])

  // --- Derived mappings ---
  const customerOptions = useMemo(() => {
    return customers
      .filter((c) => {
        if (c.notes && c.notes.startsWith('{')) {
          try {
            const parsed = JSON.parse(c.notes)
            return parsed.status !== 'INACTIVE'
          } catch (e) {
            // ignore
          }
        }
        return true
      })
      .map((c) => ({
        value: c.id,
        label: c.companyName,
      }))
  }, [customers])

  const driverOptions = useMemo(() => {
    return [
      { value: '', label: 'Select Driver...' },
      ...drivers
        .filter((d) => d.status === 'ACTIVE')
        .map((d) => {
          return {
            value: d.id,
            label: d.name,
          }
        }),
    ]
  }, [drivers])


  const driverStock = useMemo(() => {
    if (!formData.driverId) return 0
    const snapshot = inventorySnapshots.find((i) => i.item === formData.driverId)
    return snapshot ? snapshot.currentStock : 0
  }, [formData.driverId, inventorySnapshots])

  const driverWacCents = useMemo(() => {
    if (!formData.driverId) return 0
    const snapshot = inventorySnapshots.find((i) => i.item === formData.driverId)
    return snapshot ? snapshot.weightedAverageCost : 0
  }, [formData.driverId, inventorySnapshots])

  // Inline totals and profit previews
  const totalRevenueDollars = useMemo(() => {
    const qty = parseFloat(formData.quantity) || 0
    const rate = parseFloat(formData.sellingRateDollars) || 0
    return (qty * rate).toFixed(2)
  }, [formData.quantity, formData.sellingRateDollars])

  const profitPreviewDollars = useMemo(() => {
    const qty = parseFloat(formData.quantity) || 0
    const rate = parseFloat(formData.sellingRateDollars) || 0
    const wacDollars = driverWacCents / 100
    return (qty * (rate - wacDollars)).toFixed(2)
  }, [formData.quantity, formData.sellingRateDollars, driverWacCents])

  // Dashboard Summary calculations
  const summaries = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const currentMonthStr = new Date().toISOString().slice(0, 7) // YYYY-MM

    let todayVol = 0
    let monthVol = 0
    let totalRevenue = 0
    let totalProfit = 0
    let totalVol = 0

    sales.forEach((s) => {
      const rev = s.quantity * (s.sellingRate / 100)
      const prof = s.profitSnapshot / 100

      totalRevenue += rev
      totalProfit += prof
      totalVol += s.quantity

      if (s.transactionDate === todayStr) {
        todayVol += s.quantity
      }

      if (s.transactionDate.startsWith(currentMonthStr)) {
        monthVol += s.quantity
      }
    })

    const avgPrice = totalVol > 0 ? (totalRevenue / totalVol) : 0
    const avgProfit = totalVol > 0 ? (totalProfit / totalVol) : 0

    // Main bulk tank stock (depot)
    const depot = inventorySnapshots.find((i) => i.item === 'Main Tank A')
    const currentStock = depot ? depot.currentStock : 0

    return {
      todayQty: todayVol,
      monthQty: monthVol,
      totalRevenue,
      totalProfit,
      avgPrice,
      avgProfit,
      currentStock,
    }
  }, [sales, inventorySnapshots])

  // Filtered sales log
  const filteredSales = useMemo(() => {
    if (!searchQuery.trim()) return sales

    const query = searchQuery.toLowerCase()
    return sales.filter((s) => {
      const customerName = customers.find((c) => c.id === s.destinationId)?.companyName || ''
      const drvObj = drivers.find((d) => d.id === s.sourceId)
      const driverName = drvObj ? drvObj.name : ''

      return (
        s.transactionNumber.toLowerCase().includes(query) ||
        s.referenceNumber?.toLowerCase().includes(query) ||
        customerName.toLowerCase().includes(query) ||
        driverName.toLowerCase().includes(query) ||
        s.notes?.toLowerCase().includes(query) ||
        s.transactionDate.includes(query)
      )
    })
  }, [sales, searchQuery, customers, drivers])

  // --- Keyboard Traversal ---
  const handleKeyDown = (e: React.KeyboardEvent, field: keyof SaleFormData) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'date') {
        refDriver.current?.focus()
      } else if (field === 'customerId') {
        refDriver.current?.focus()
      } else if (field === 'driverId') {
        refQty.current?.focus()
      } else if (field === 'quantity') {
        refRate.current?.focus()
      } else if (field === 'sellingRateDollars') {
        refRefNum.current?.focus()
      } else if (field === 'referenceNumber') {
        refNotes.current?.focus()
      } else if (field === 'notes') {
        handleSubmit()
      }
    }
  }

  const handleCreateCustomer = async (name: string) => {
    try {
      const newCust = await createCustomer({
        companyName: name,
        contactPerson: 'Auto Registered',
        phone: '',
        address: '',
        notes: JSON.stringify({
          email: '',
          taxNumber: '',
          status: 'ACTIVE',
          notes: 'Automatically registered during sales invoice creation',
        }),
      })
      setFormData((prev) => ({ ...prev, customerId: newCust.id }))
      addToast(`Customer "${name}" auto-registered successfully`, 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to auto-register customer', 'error')
    }
  }

  // --- Actions ---
  const handleNew = () => {
    setFormData({
      ...emptyForm,
      date: new Date().toISOString().slice(0, 10),
    })
    setFormErrors({})
    setEditId(null)
    setIsEditing(true)
    setTimeout(() => refDate.current?.focus(), 50)
  }

  const handleEdit = (tx?: any) => {
    const row = tx || selectedTxRow
    if (!row) return

    // Find driver associated with source
    const driverId = row.sourceId || ''

    setFormData({
      date: row.transactionDate,
      customerId: row.destinationId,
      driverId,
      quantity: String(row.quantity),
      sellingRateDollars: String((row.sellingRate / 100).toFixed(2)),
      referenceNumber: row.referenceNumber || '',
      notes: row.notes || '',
    })
    setFormErrors({})
    setEditId(row.id)
    setIsEditing(true)
    setTimeout(() => refQty.current?.focus(), 50)
  }

  const handleDelete = () => {
    if (!selectedTxRow) return
    showDialog({
      title: 'Soft-Delete Customer Sale',
      message: `Are you sure you want to soft-delete sale invoice "${selectedTxRow.transactionNumber}"? This will reverse the stock deduction on the driver and recalculate downstream ledger statement costs.`,
      type: 'delete',
      confirmText: 'Soft Delete',
      onConfirm: async () => {
        try {
          await deleteSale(selectedTxRow.id)
          addToast('Sale transaction soft-deleted successfully', 'success')
          setSelectedTxRow(null)
          loadData()
        } catch (err: any) {
          addToast(err.message || 'Error deleting sale', 'error')
        }
      },
    })
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData(emptyForm)
    setFormErrors({})
    setEditId(null)
  }

  const validate = (): boolean => {
    const errors: Partial<Record<keyof SaleFormData, string>> = {}

    if (!formData.date) errors.date = 'Date is required'
    if (!formData.customerId) errors.customerId = 'Customer is required'
    if (!formData.driverId) errors.driverId = 'Driver is required'

    const qty = parseFloat(formData.quantity)
    if (isNaN(qty) || qty <= 0) {
      errors.quantity = `Quantity must be greater than 0 ${unit}`
    } else {
      // Balance check: account for editId prior quantity
      let priorQty = 0
      if (editId && selectedTxRow) {
        if (selectedTxRow.sourceId === formData.driverId) {
          priorQty = selectedTxRow.quantity
        }
      }
      const availableStock = driverStock + priorQty
      if (qty > availableStock) {
        errors.quantity = `Insufficient inventory. Available: ${FormattingService.formatQuantity(availableStock)}`
      }
    }

    const rate = parseFloat(formData.sellingRateDollars)
    if (isNaN(rate) || rate <= 0) {
      errors.sellingRateDollars = `Selling rate must be greater than 0 ${symbol}`
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) {
      addToast('Please resolve validation errors before saving', 'error')
      return
    }

    try {
      const payload = {
        driverId: formData.driverId,
        customerId: formData.customerId,
        quantity: parseFloat(formData.quantity),
        sellingRate: Math.round(parseFloat(formData.sellingRateDollars) * 100), // in cents
        referenceNumber: formData.referenceNumber || undefined,
        transactionDate: formData.date,
        notes: formData.notes || undefined,
      }

      if (editId) {
        await updateSale(editId, payload)
        addToast('Customer sale invoice updated and recalculated successfully', 'success')
      } else {
        await createSale(payload)
        addToast('Customer sale transaction created successfully', 'success')
      }

      setIsEditing(false)
      setFormData(emptyForm)
      setEditId(null)
      setSelectedTxRow(null)
      loadData()
    } catch (err: any) {
      addToast(err.message || 'Error processing sale', 'error')
    }
  }

  // Keyboard Shortcuts
  useShortcutEffect('new', handleNew)
  useShortcutEffect('save', () => {
    if (isEditing) handleSubmit()
  })
  useShortcutEffect('escape', () => {
    if (isEditing) handleCancel()
  })
  useShortcutEffect('refresh', loadData)

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (isEditing) return
      if (e.key === 'Delete') {
        handleDelete()
      } else if (e.key === 'F2' && selectedTxRow) {
        handleEdit()
      }
    }
    window.addEventListener('keydown', handleKeys)
    return () => window.removeEventListener('keydown', handleKeys)
  }, [selectedTxRow, isEditing])

  // Columns Configuration
  const columns = useMemo((): GridColumn<any>[] => {
    return [
      { key: 'transactionNumber', header: 'Tx Number', width: 95 },
      { key: 'transactionDate', header: 'Date', width: 90 },
      {
        key: 'customer',
        header: 'Customer Company',
        width: 150,
        render: (row) => customers.find((c) => c.id === row.destinationId)?.companyName || 'Unknown Customer',
      },
      {
        key: 'driver',
        header: 'Selling Driver',
        width: 140,
        render: (row) => {
          const d = drivers.find((drv) => drv.id === row.sourceId)
          return d ? d.name : 'Unknown Driver'
        },
      },
      { key: 'quantity', header: `Volume (${unit})`, width: 95, type: 'number' },
      { key: 'sellingRate', header: 'Selling Rate', width: 95, type: 'currency' },
      {
        key: 'revenue',
        header: 'Revenue',
        width: 105,
        render: (row) => FormattingService.formatCurrency(row.quantity * row.sellingRate),
      },
      {
        key: 'cost',
        header: 'Carrying WAC',
        width: 105,
        render: (row) => FormattingService.formatCurrency(row.quantity * row.averageCostSnapshot),
      },
      { key: 'profitSnapshot', header: 'Profit Margin', width: 105, type: 'currency' },
      { key: 'referenceNumber', header: 'Ref Number', width: 100 },
      {
        key: 'status',
        header: 'Status',
        width: 80,
        render: () => (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 border border-green-200 text-green-700">
            POSTED
          </span>
        ),
      },
    ]
  }, [customers, drivers])

  return (
    <div className="space-y-4">
      {/* 1. Toolbar */}
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
            <span>New Sale <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+N</kbd></span>
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

          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw size={13} />
            <span>Refresh <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+R</kbd></span>
          </Button>
        </div>

        {/* Search */}
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
              placeholder="Search sales logs..."
              className="w-full pl-8 pr-3 py-1 bg-gray-50 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2. Excel-like Entry Grid */}
      {isEditing && (
        <div className="border bg-white rounded shadow-md overflow-hidden p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              {editId ? `Editing Sale Invoice: ${selectedTxRow?.transactionNumber}` : 'New Customer Sale Entry Grid'}
            </span>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Discard [Esc]
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-3 select-none">
            {/* Cell 1: Date */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Sale Date</label>
              <input
                ref={refDate}
                type="date"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${
                  formErrors.date ? 'border-red-400' : 'border-gray-300'
                }`}
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'date')}
              />
              {formErrors.date && <p className="text-[9px] text-red-500 font-bold">{formErrors.date}</p>}
            </div>

            {/* Cell 2: Customer */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Customer</label>
              <Combobox
                options={customerOptions}
                value={formData.customerId}
                onChange={(val) => setFormData({ ...formData, customerId: val })}
                placeholder="Lookup Customer..."
                error={formErrors.customerId}
                onCreateCustom={handleCreateCustomer}
              />
            </div>

            {/* Cell 3: Driver */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Driver</label>
                {formData.driverId && (
                  <span className="text-[9px] font-bold text-blue-600 font-mono">Stock: {FormattingService.formatQuantity(driverStock)}</span>
                )}
              </div>
              <select
                ref={refDriver}
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${
                  formErrors.driverId ? 'border-red-400' : 'border-gray-300'
                }`}
                value={formData.driverId}
                onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'driverId')}
              >
                {driverOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {formErrors.driverId && <p className="text-[9px] text-red-500 font-bold">{formErrors.driverId}</p>}
            </div>

            {/* Cell 4: Quantity */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Volume (Gal)</label>
              <input
                ref={refQty}
                type="number"
                step="any"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${
                  formErrors.quantity ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="0.00"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'quantity')}
              />
              {formErrors.quantity && <p className="text-[9px] text-red-500 font-bold">{formErrors.quantity}</p>}
            </div>

            {/* Cell 5: Selling Rate */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Selling Price ({symbol}/{unit})</label>
              <input
                ref={refRate}
                type="number"
                step="0.01"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${
                  formErrors.sellingRateDollars ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="0.00"
                value={formData.sellingRateDollars}
                onChange={(e) => setFormData({ ...formData, sellingRateDollars: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'sellingRateDollars')}
              />
              {formErrors.sellingRateDollars && <p className="text-[9px] text-red-500 font-bold">{formErrors.sellingRateDollars}</p>}
            </div>

            {/* Cell 6: Invoice Total */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Total Amount</label>
              <div className="px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded text-gray-700 font-bold font-mono">
                {FormattingService.formatCurrency(parseFloat(totalRevenueDollars) * 100)}
              </div>
            </div>

            {/* Cell 7: Profit Preview */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Profit Preview</label>
              <div className={`px-2.5 py-1.5 text-xs border rounded font-bold font-mono ${
                parseFloat(profitPreviewDollars) >= 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {FormattingService.formatCurrency(parseFloat(profitPreviewDollars) * 100)}
              </div>
            </div>
          </div>

          {/* Reference and Memo Notes */}
          <div className="grid grid-cols-2 gap-3 select-none">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Delivery Ticket / Ref Number</label>
              <input
                ref={refRefNum}
                type="text"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g. DT-1002"
                value={formData.referenceNumber}
                onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'referenceNumber')}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Ledger Remarks / Notes</label>
              <input
                ref={refNotes}
                type="text"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Write memo for compliance audits..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'notes')}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Sales Summary Panel */}
      <div className="grid grid-cols-6 gap-4 select-none">
        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Today's Sales ({unit})</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatQuantity(summaries.todayQty)}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded">
            <ShoppingBag size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">This Month Volume</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatQuantity(summaries.monthQty)}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded">
            <ShoppingBag size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Total Revenue</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatCurrency(summaries.totalRevenue * 100)}</p>
          </div>
          <div className="p-2 bg-green-50 text-green-600 rounded">
            <Coins size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Total Net Profit</span>
            <p className="text-sm font-bold text-green-600">{FormattingService.formatCurrency(summaries.totalProfit * 100)}</p>
          </div>
          <div className="p-2 bg-green-50 text-green-600 rounded">
            <TrendingUp size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Avg Selling Price</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatRate(Math.round(summaries.avgPrice * 100))}</p>
          </div>
          <div className="p-2 bg-gray-50 text-gray-600 rounded">
            <Coins size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Avg Profit / {unit}</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatRate(Math.round(summaries.avgProfit * 100))}</p>
          </div>
          <div className="p-2 bg-gray-50 text-gray-600 rounded">
            <Database size={14} />
          </div>
        </div>
      </div>

      {/* 4. Recent Sales History Grid */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider select-none">
          Chronological Customer Sales Invoices Registry Log
        </div>
        <DataGrid
          columns={columns}
          data={filteredSales}
          onSelectionChange={(selected) => {
            if (selected.length > 0) {
              setSelectedTxRow(selected[0])
            } else {
              setSelectedTxRow(null)
            }
          }}
        />
      </div>

      {/* 5. Status Bar */}
      <div className="border-t pt-2 flex items-center justify-between text-[10px] text-gray-400 font-mono select-none">
        <div className="flex items-center gap-4">
          <span>OPERATOR: {currentOperator || 'N/A'}</span>
          <span>DATABASE: {dbConnected ? 'SQLITE_ONLINE' : 'SQLITE_OFFLINE'}</span>
        </div>
        <div>
          <span>Malak Enterprise ERP v1.0.0</span>
        </div>
      </div>
    </div>
  )
}
