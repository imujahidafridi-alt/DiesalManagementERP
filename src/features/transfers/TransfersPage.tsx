import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore, useUiStore } from '@/store'
import { appConfig } from '@/config/appConfig'
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
  ArrowRightLeft,
} from 'lucide-react'

interface TransferFormData {
  date: string
  fromDriverId: string
  toDriverId: string
  quantity: string
  vehicleNumber: string
  notes: string
}

const emptyForm: TransferFormData = {
  date: new Date().toLocaleDateString('en-CA'),
  fromDriverId: '',
  toDriverId: '',
  quantity: '',
  vehicleNumber: '',
  notes: '',
}

export default function TransfersPage() {
  const {
    drivers,
    inventorySnapshots,
    fetchDrivers,
    fetchInventorySnapshots,
    createTransfer,
    updateTransfer,
    deleteTransfer,
    dbConnected,
  } = useAppStore()

  const { addToast, showDialog } = useUiStore()

  const { quantityAbbreviation: unit } = useBusinessSettings()

  // Transactions list (representing TRANSFERS)
  const [allTransactions, setAllTransactions] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Local UI states
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formData, setFormData] = useState<TransferFormData>(emptyForm)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof TransferFormData, string>>>({})
  const [selectedTxRow, setSelectedTxRow] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Input refs for keyboard traversals
  const refDate = useRef<HTMLInputElement>(null)
  const refFrom = useRef<HTMLDivElement>(null)
  const refTo = useRef<HTMLDivElement>(null)
  const refVehicleNum = useRef<HTMLInputElement>(null)
  const refQty = useRef<HTMLInputElement>(null)
  const refNotes = useRef<HTMLInputElement>(null)

  // Load dependency options
  const loadData = async () => {
    setLoadingHistory(true)
    try {
      await Promise.all([
        fetchDrivers(),
        fetchInventorySnapshots(),
      ])
      const list = await window.api.invoke('transactions:list')
      // Filter list to TRANSFERS only
      const transfersOnly = list.filter((t) => t.transactionType === 'TRANSFER')
      transfersOnly.reverse() // Sort ascending chronologically (1-2-3-n)
      setAllTransactions(transfersOnly)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const { activeLookupId, setActiveLookupId } = useUiStore()

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeLookupId && allTransactions.length > 0) {
      const match = allTransactions.find((t) => t.id === activeLookupId)
      if (match) {
        setSelectedTxRow(match)
        setActiveLookupId(null)
      }
    }
  }, [activeLookupId, allTransactions])

  // --- Derived calculations ---
  const fromDriverOptions = useMemo(() => {
    return drivers
      .filter((d) => d.status === 'ACTIVE' && d.id !== formData.toDriverId)
      .map((d) => ({
        value: d.id,
        label: d.name,
      }))
  }, [drivers, formData.toDriverId])

  const toDriverOptions = useMemo(() => {
    return drivers
      .filter((d) => d.status === 'ACTIVE' && d.id !== formData.fromDriverId)
      .map((d) => ({
        value: d.id,
        label: d.name,
      }))
  }, [drivers, formData.fromDriverId])

  const getDriverStock = (driverId: string) => {
    const snapshot = inventorySnapshots.find((i) => i.item === driverId)
    return snapshot ? snapshot.currentStock : 0
  }

  // Live balances in form
  const fromDriverStock = useMemo(() => {
    if (!formData.fromDriverId) return 0
    return getDriverStock(formData.fromDriverId)
  }, [formData.fromDriverId, inventorySnapshots])

  const toDriverStock = useMemo(() => {
    if (!formData.toDriverId) return 0
    return getDriverStock(formData.toDriverId)
  }, [formData.toDriverId, inventorySnapshots])

  // Summaries
  const summaries = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('en-CA')
    let todayVol = 0
    let totalVol = 0
    let todayCount = 0

    allTransactions.forEach((t) => {
      totalVol += t.quantity
      if (t.transactionDate === todayStr) {
        todayVol += t.quantity
        todayCount++
      }
    })

    const avgVol = todayCount > 0 ? (todayVol / todayCount) : 0

    return {
      todayVol,
      todayCount,
      avgVol,
    }
  }, [allTransactions])

  // Filtered list
  const filteredTransfers = useMemo(() => {
    if (!searchQuery.trim()) return allTransactions

    const query = searchQuery.toLowerCase()
    return allTransactions.filter((t) => {
      // Find drivers directly using sourceId/destinationId
      const srcDriver = drivers.find((d) => d.id === t.sourceId)
      const destDriver = drivers.find((d) => d.id === t.destinationId)
      const srcDriverName = srcDriver ? srcDriver.name : ''
      const destDriverName = destDriver ? destDriver.name : ''

      return (
        t.transactionNumber.toLowerCase().includes(query) ||
        t.referenceNumber?.toLowerCase().includes(query) ||
        srcDriverName.toLowerCase().includes(query) ||
        destDriverName.toLowerCase().includes(query) ||
        t.notes?.toLowerCase().includes(query) ||
        t.transactionDate.includes(query)
      )
    })
  }, [allTransactions, searchQuery, drivers])

  // --- Keyboard Traversal ---
  const handleKeyDown = (e: React.KeyboardEvent, field: keyof TransferFormData) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'date') {
        refFrom.current?.focus()
      } else if (field === 'fromDriverId') {
        refTo.current?.focus()
      } else if (field === 'toDriverId') {
        refVehicleNum.current?.focus()
      } else if (field === 'vehicleNumber') {
        refQty.current?.focus()
      } else if (field === 'quantity') {
        refNotes.current?.focus()
      } else if (field === 'notes') {
        handleSubmit()
      }
    }
  }

  // --- Actions ---
  const handleNew = () => {
    setFormData({
      ...emptyForm,
      date: new Date().toLocaleDateString('en-CA'),
    })
    setFormErrors({})
    setEditId(null)
    setIsEditing(true)
    addToast('Ready for new transfer entry. Keyboard focus set.', 'info')
    setTimeout(() => refDate.current?.focus(), 50)
  }

  const handleEdit = (tx?: any) => {
    const row = tx || selectedTxRow
    if (!row) return

    setFormData({
      date: row.transactionDate,
      fromDriverId: row.sourceId || '',
      toDriverId: row.destinationId || '',
      quantity: String(row.quantity),
      vehicleNumber: row.referenceNumber || '',
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
      title: 'Soft-Delete Internal Transfer',
      message: `Are you sure you want to soft-delete internal transfer "${selectedTxRow.transactionNumber}"? Stock levels will be chronologically recalculated.`,
      type: 'delete',
      confirmText: 'Soft Delete',
      onConfirm: async () => {
        try {
          await deleteTransfer(selectedTxRow.id)
          addToast('Transfer deleted successfully', 'success')
          setSelectedTxRow(null)
          loadData()
        } catch (err: any) {
          addToast(err.message || 'Error deleting transfer', 'error')
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
    const errors: Partial<Record<keyof TransferFormData, string>> = {}

    if (!formData.date) errors.date = 'Date is required'
    if (!formData.fromDriverId) errors.fromDriverId = 'Source driver is required'
    if (!formData.toDriverId) errors.toDriverId = 'Destination driver is required'
    if (formData.fromDriverId === formData.toDriverId && formData.fromDriverId !== '') {
      errors.toDriverId = 'Source and destination drivers cannot be the same.'
    }

    const qty = parseFloat(formData.quantity)
    if (isNaN(qty) || qty <= 0) {
      errors.quantity = `Quantity must be greater than 0 ${unit}`
    } else {
      // Balance check: account for editId prior quantity
      let priorQty = 0
      if (editId && selectedTxRow && selectedTxRow.sourceId === formData.fromDriverId) {
        priorQty = selectedTxRow.quantity
      }
      const available = fromDriverStock + priorQty
      if (qty > available) {
        errors.quantity = `Insufficient inventory. Available: ${FormattingService.formatQuantity(available)}`
      }
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
        fromDriverId: formData.fromDriverId,
        toDriverId: formData.toDriverId,
        quantity: parseFloat(formData.quantity),
        vehicleNumber: formData.vehicleNumber || undefined,
        transactionDate: formData.date,
        notes: formData.notes || undefined,
      }

      if (editId) {
        await updateTransfer(editId, payload)
        addToast('Transfer invoice updated successfully', 'success')
      } else {
        await createTransfer(payload)
        addToast('Transfer processed successfully', 'success')
      }

      setIsEditing(false)
      setFormData(emptyForm)
      setEditId(null)
      setSelectedTxRow(null)
      loadData()
    } catch (err: any) {
      addToast(err.message || 'Error processing transfer', 'error')
    }
  }

  // Short-cuts
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
      { key: 'transactionNumber', header: 'Invoice No', width: 95 },
      { key: 'transactionDate', header: 'Date', width: 90 },
      {
        key: 'fromDriver',
        header: 'From Driver',
        width: 150,
        render: (row) => {
          const d = drivers.find((drv) => drv.id === row.sourceId)
          return d ? d.name : 'Unknown Driver'
        },
      },
      {
        key: 'toDriver',
        header: 'To Driver',
        width: 150,
        render: (row) => {
          const d = drivers.find((drv) => drv.id === row.destinationId)
          return d ? d.name : 'Unknown Driver'
        },
      },
      { key: 'referenceNumber', header: 'Vehicle Number', width: 110 },
      { key: 'quantity', header: `Volume (${unit})`, width: 100, type: 'number' },
      { key: 'notes', header: 'Notes/Memo', width: 180 },
      {
        key: 'status',
        header: 'Status',
        width: 80,
        render: () => (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700">
            COMPLETED
          </span>
        ),
      },
    ]
  }, [drivers, unit])

  return (
    <div className="space-y-4">
      {/* 1. Transfer Entry Toolbar */}
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
            <span>New Transfer <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+N</kbd></span>
          </Button>

          <Button
            variant={isEditing ? 'primary' : 'outline'}
            size="sm"
            onClick={handleSubmit}
            disabled={!isEditing || (formData.fromDriverId === formData.toDriverId && formData.fromDriverId !== '')}
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
            <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''} />
            <span>Refresh <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+R</kbd></span>
          </Button>
        </div>

        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search transfers..."
            className="w-full pl-8 pr-3 py-1 bg-gray-50 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 2. Transfer Entry Form Grid */}
      {isEditing && (
        <div className="border bg-white rounded shadow-md p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              {editId ? `Editing Transfer: ${selectedTxRow?.transactionNumber}` : 'Internal Diesel Transfer Form'}
            </span>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel [Esc]
            </Button>
          </div>

          <div className="grid grid-cols-6 gap-3 select-none">
            {/* Cell 1: Date */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Transfer Date</label>
              <input
                ref={refDate}
                type="date"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.date ? 'border-red-400' : 'border-gray-300'
                  }`}
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'date')}
              />
              {formErrors.date && <p className="text-[9px] text-red-500 font-bold">{formErrors.date}</p>}
            </div>

            {/* Cell 2: From Driver */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">From Driver</label>
                {formData.fromDriverId && (
                  <span className="text-[9px] font-bold text-blue-600 font-mono">Bal: {FormattingService.formatQuantity(fromDriverStock)}</span>
                )}
              </div>
              <Combobox
                ref={refFrom}
                options={fromDriverOptions}
                value={formData.fromDriverId}
                onChange={(val) => setFormData({ ...formData, fromDriverId: val })}
                onSelect={() => refTo.current?.focus()}
                placeholder="Select Driver..."
                error={formErrors.fromDriverId}
              />
            </div>

            {/* Cell 3: To Driver */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">To Driver</label>
                {formData.toDriverId && (
                  <span className="text-[9px] font-bold text-green-600 font-mono">Bal: {FormattingService.formatQuantity(toDriverStock)}</span>
                )}
              </div>
              <Combobox
                ref={refTo}
                options={toDriverOptions}
                value={formData.toDriverId}
                onChange={(val) => setFormData({ ...formData, toDriverId: val })}
                onSelect={() => refVehicleNum.current?.focus()}
                placeholder="Select Driver..."
                error={formErrors.toDriverId || (formData.fromDriverId === formData.toDriverId && formData.fromDriverId !== '' ? 'Source and destination drivers cannot be the same.' : undefined)}
              />
            </div>

            {/* Cell 4: Vehicle Number */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Vehicle Number</label>
              <input
                ref={refVehicleNum}
                type="text"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g. TN-4587"
                value={formData.vehicleNumber}
                onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'vehicleNumber')}
              />
            </div>

            {/* Cell 5: Quantity */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Quantity ({unit})</label>
              <input
                ref={refQty}
                type="number"
                step="any"
                className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none ${formErrors.quantity ? 'border-red-400' : 'border-gray-300'
                  }`}
                placeholder="0.00"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'quantity')}
              />
              {formErrors.quantity && <p className="text-[9px] text-red-500 font-bold">{formErrors.quantity}</p>}
            </div>

            {/* Cell 6: Notes */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase">Transfer Notes</label>
              <input
                ref={refNotes}
                type="text"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Write transaction memo..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'notes')}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Summary Panel */}
      <div className="grid grid-cols-3 gap-4 select-none">
        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Total Transferred Today</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatQuantity(summaries.todayVol)}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded">
            <ArrowRightLeft size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Transfers Completed Today</span>
            <p className="text-sm font-bold text-gray-800">{summaries.todayCount} Operations</p>
          </div>
          <div className="p-2 bg-green-50 text-green-600 rounded">
            <ArrowRightLeft size={14} />
          </div>
        </div>

        <div className="bg-white border rounded shadow-subtle p-3.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-gray-400">Average Transfer Volume</span>
            <p className="text-sm font-bold text-gray-800">{FormattingService.formatQuantity(summaries.avgVol)}</p>
          </div>
          <div className="p-2 bg-gray-50 text-gray-600 rounded">
            <ArrowRightLeft size={14} />
          </div>
        </div>
      </div>

      {/* 4. Transfer History Log */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider select-none">
          Chronological Internal Fuel Transfers History
        </div>
        <DataGrid
          columns={columns}
          data={filteredTransfers}
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
          <span>DATABASE: {dbConnected ? 'SQLITE_ONLINE' : 'SQLITE_OFFLINE'}</span>
        </div>
        <div>
          <span>Sahara Diesels {appConfig.version}</span>
        </div>
      </div>
    </div>
  )
}
