import React, { useState, useEffect, useMemo } from 'react'
import { useAppStore, useUiStore } from '@/store'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import { FormattingService } from '@/utils/FormattingService'
import { PdfService } from '@/utils/PdfService'
import {
  Button,
  Select,
  DataGrid,
  useShortcutEffect,
} from '@/components/ui'
import type { GridColumn } from '@/components/ui/DataGrid'
import {
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  User,
  FileText,
  Printer,
  X,
  Download,
} from 'lucide-react'

interface DriverFormData {
  name: string
  phone: string
  notes: string
  status: 'ACTIVE' | 'INACTIVE'
}

const emptyForm: DriverFormData = {
  name: '',
  phone: '',
  notes: '',
  status: 'ACTIVE',
}

export default function DriversPage() {
  const { currencySymbol: symbol, quantityAbbreviation: unit } = useBusinessSettings()
  const {
    drivers,
    inventorySnapshots,
    loadingDrivers,
    fetchDrivers,
    fetchInventorySnapshots,
    createDriver,
    updateDriver,
    deleteDriver,
    getDriverStatementReport,
  } = useAppStore()

  const { addToast, showDialog } = useUiStore()

  // Selection states
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Form states
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<DriverFormData>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)

  // Statement / Ledger Modal states
  const [isStatementOpen, setIsStatementOpen] = useState(false)
  const [statementReport, setStatementReport] = useState<any | null>(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statementTab, setStatementTab] = useState<'inventory' | 'sales'>('inventory')


  const { activeLookupId, setActiveLookupId } = useUiStore()

  useEffect(() => {
    fetchDrivers()
    fetchInventorySnapshots()
  }, [])

  useEffect(() => {
    if (activeLookupId && drivers.length > 0) {
      const match = drivers.find((d) => d.id === activeLookupId)
      if (match) {
        setSelectedDriver(match)
        setActiveLookupId(null)
      }
    }
  }, [activeLookupId, drivers])



  // Filtered drivers list
  const filteredDrivers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return drivers.filter((d) => {
      return (
        d.name.toLowerCase().includes(query) ||
        (d.phone || '').toLowerCase().includes(query) ||
        (d.notes || '').toLowerCase().includes(query)
      )
    })
  }, [drivers, searchQuery])

  // --- Actions ---
  const handleRefresh = async () => {
    await fetchDrivers()
    addToast('Driver registry refreshed', 'success')
  }

  const handleNew = () => {
    setFormData(emptyForm)
    setEditId(null)
    setIsEditing(true)
  }

  const handleEdit = () => {
    if (!selectedDriver) return
    setFormData({
      name: selectedDriver.name,
      phone: selectedDriver.phone,
      notes: selectedDriver.notes || '',
      status: selectedDriver.status || 'ACTIVE',
    })
    setEditId(selectedDriver.id)
    setIsEditing(true)
  }

  const handleDelete = () => {
    if (!selectedDriver) return
    showDialog({
      title: 'Archive Driver Profile',
      message: `Are you sure you want to soft-delete/archive driver "${selectedDriver.name}"? Active vehicle assignments will be unlinked.`,
      type: 'delete',
      confirmText: 'Archive Driver',
      onConfirm: async () => {
        try {
          await deleteDriver(selectedDriver.id)
          addToast('Driver archived successfully', 'success')
          setSelectedDriver(null)
        } catch (err: any) {
          addToast(err.message || 'Error deleting driver', 'error')
        }
      },
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      addToast('Driver name is required', 'error')
      return
    }

    try {
      if (editId) {
        const res = await updateDriver(editId, {
          name: formData.name,
          phone: formData.phone || null,
          notes: formData.notes || null,
          status: formData.status,
        })
        setSelectedDriver(res)
        addToast('Driver updated successfully', 'success')
      } else {
        const res = await createDriver({
          name: formData.name,
          phone: formData.phone || null,
          notes: formData.notes || null,
          status: formData.status,
          address: null,
        })
        setSelectedDriver(res)
        addToast('Driver created successfully', 'success')
      }
      setIsEditing(false)
    } catch (err: any) {
      addToast(err.message || 'Error saving driver', 'error')
    }
  }



  // --- Statement Generation ---
  const handleOpenStatement = async () => {
    if (!selectedDriver) return
    setStatementLoading(true)
    setIsStatementOpen(true)
    try {
      const filters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }
      const rep = await getDriverStatementReport(selectedDriver.id, filters)
      setStatementReport(rep)
    } catch (err: any) {
      addToast(err.message || 'Failed to fetch statement report', 'error')
    } finally {
      setStatementLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportInventoryPDF = () => {
    if (!statementReport || statementReport.lines.length === 0) return

    PdfService.generateReportPDF('driver_inventory_ledger_detail', statementReport.lines, {
      startDate,
      endDate,
      companyName: 'Malak Enterprise',
      title: 'Driver Inventory Ledger Statement',
      partyName: statementReport.driverName,
      operator: localStorage.getItem('diesel_user') || 'ERP Operator',
    })
  }

  const handleExportSalesPDF = () => {
    if (!statementReport || statementReport.lines.length === 0) return

    const salesLines = statementReport.lines.filter((l: any) => l.transactionType === 'SALE')

    PdfService.generateReportPDF('driver_sales_ledger_detail', salesLines, {
      startDate,
      endDate,
      companyName: 'Malak Enterprise',
      title: 'Driver Sales Ledger Statement',
      partyName: statementReport.driverName,
      operator: localStorage.getItem('diesel_user') || 'ERP Operator',
    })
  }

  // Register Shortcuts
  useShortcutEffect('new', handleNew)
  useShortcutEffect('refresh', handleRefresh)

  // Columns for directory list
  const columns: GridColumn<any>[] = [
    { key: 'name', header: 'Driver Name', width: 150 },
    { key: 'phone', header: 'Phone Number', width: 120 },
    {
      key: 'status',
      header: 'Status',
      width: 90,
      render: (row) => (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            row.status === 'ACTIVE' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-gray-50 border border-gray-200 text-gray-700'
          }`}
        >
          {row.status || 'ACTIVE'}
        </span>
      ),
    },
  ]

  // Columns for modal statement lines
  const statementColumns = useMemo((): GridColumn<any>[] => [
    { key: 'transactionDate', header: 'Date', width: 90 },
    { key: 'transactionNumber', header: 'Tx Number', width: 100 },
    {
      key: 'transactionType',
      header: 'Type',
      width: 100,
      render: (row) => {
        if (row.transactionType === 'TRANSFER') {
          return row.qtyIn > 0 ? 'Transfer In' : 'Transfer Out'
        }
        if (row.transactionType === 'PURCHASE') return 'Purchase'
        if (row.transactionType === 'SALE') return 'Sale'
        if (row.transactionType === 'RETURN') return 'Return'
        if (row.transactionType === 'ADJUSTMENT') return 'Adjustment'
        return row.transactionType
      }
    },
    { key: 'partyName', header: 'Source/Destination', width: 150 },
    {
      key: 'qtyIn',
      header: `Qty In (${unit})`,
      width: 95,
      render: (row) => row.qtyIn > 0 ? FormattingService.formatQuantity(row.qtyIn) : '-'
    },
    {
      key: 'qtyOut',
      header: `Qty Out (${unit})`,
      width: 95,
      render: (row) => row.qtyOut > 0 ? FormattingService.formatQuantity(row.qtyOut) : '-'
    },
    {
      key: 'rate',
      header: 'Rate/Cost',
      width: 95,
      render: (row) => {
        const rate = row.transactionType === 'SALE' ? row.sellingRate : (row.averageCostSnapshot || row.unitCost || 0)
        return rate > 0 ? FormattingService.formatRate(rate) : '-'
      }
    },
    {
      key: 'referenceNumber',
      header: 'Vehicle No',
      width: 95,
      render: (row) => row.transactionType === 'PURCHASE' ? (row.referenceNumber || '-') : '-'
    },
    {
      key: 'runningBalance',
      header: `Running Bal (${unit})`,
      width: 110,
      render: (row) => FormattingService.formatQuantity(row.runningBalance)
    },
  ], [unit, symbol])

  const salesColumns = useMemo((): GridColumn<any>[] => [
    { key: 'transactionDate', header: 'Date', width: 90 },
    { key: 'transactionNumber', header: 'Voucher No', width: 100 },
    { key: 'partyName', header: 'Customer', width: 150 },
    {
      key: 'volume',
      header: `Sold Volume (${unit})`,
      width: 95,
      render: (row) => FormattingService.formatQuantity(row.volume || row.quantity || 0)
    },
    {
      key: 'sellingRate',
      header: 'Sale Price',
      width: 95,
      render: (row) => FormattingService.formatRate(row.sellingRate || 0)
    },
    {
      key: 'averageCostSnapshot',
      header: 'Buy Cost',
      width: 95,
      render: (row) => FormattingService.formatRate(row.averageCostSnapshot || row.unitCost || 0)
    },
    {
      key: 'profitPerUnit',
      header: 'Profit per Unit',
      width: 100,
      render: (row) => {
        const buyCost = row.averageCostSnapshot || row.unitCost || 0
        const profit = (row.sellingRate || 0) - buyCost
        return FormattingService.formatRate(profit)
      }
    },
    {
      key: 'saleAmount',
      header: 'Sale Amount',
      width: 110,
      render: (row) => {
        const qty = row.volume || row.quantity || 0
        const amount = qty * (row.sellingRate || 0)
        return FormattingService.formatCurrency(amount)
      }
    },
    {
      key: 'totalProfit',
      header: 'Total Profit',
      width: 110,
      render: (row) => {
        const qty = row.volume || row.quantity || 0
        const buyCost = row.averageCostSnapshot || row.unitCost || 0
        const profit = qty * ((row.sellingRate || 0) - buyCost)
        return FormattingService.formatCurrency(profit)
      }
    },
  ], [unit, symbol])

  const salesLines = useMemo(() => {
    if (!statementReport || !statementReport.lines) return []
    return statementReport.lines.filter((l: any) => l.transactionType === 'SALE' && (l.volume || l.quantity || 0) > 0)
  }, [statementReport])

  const salesSummary = useMemo(() => {
    let totalVol = 0
    let totalSales = 0
    let totalCost = 0
    let totalProfit = 0

    salesLines.forEach((row: any) => {
      const qty = row.volume || row.quantity || 0
      const salePrice = row.sellingRate || 0
      const buyCost = row.averageCostSnapshot || row.unitCost || 0
      
      totalVol += qty
      totalSales += qty * salePrice
      totalCost += qty * buyCost
      totalProfit += qty * (salePrice - buyCost)
    })

    return {
      totalVol,
      totalSales,
      totalCost,
      totalProfit,
    }
  }, [salesLines])

  return (
    <div className="space-y-4">
      {/* 1. Toolbar */}
      <div className="flex items-center justify-between border-b pb-3 select-none bg-white p-3.5 rounded border shadow-subtle">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNew} className="gap-2">
            <Plus size={13} />
            <span>New Driver <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+N</kbd></span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw size={13} className={loadingDrivers ? 'animate-spin' : ''} />
            <span>Refresh <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+R</kbd></span>
          </Button>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search driver registry..."
            className="w-full pl-8 pr-3 py-1 bg-gray-50 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left Column: Driver Directory Grid */}
        <div className="col-span-2 space-y-2">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider select-none">
            Driver Registry Directory
          </div>
          <DataGrid
            columns={columns}
            data={filteredDrivers}
            onSelectionChange={(selected) => {
              if (selected.length > 0) {
                setSelectedDriver(selected[0])
              } else {
                setSelectedDriver(null)
              }
            }}
          />
        </div>

        {/* Right Column: Driver Details & Live Balance Card */}
        <div className="space-y-4">
          {selectedDriver ? (
            <div className="space-y-4">
              {/* Balance Card */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded shadow-subtle p-4 select-none relative overflow-hidden">
                <div className="absolute right-[-10px] bottom-[-10px] opacity-10 text-blue-900 pointer-events-none">
                  <User size={120} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 block">
                  Active Driver Stock Balance
                </span>
                <h3 className="text-2xl font-black text-blue-900 mt-1 font-mono">
                  {(() => {
                    const snap = inventorySnapshots.find((s) => s.item === selectedDriver.id)
                    return `${FormattingService.formatQuantity(snap ? snap.currentStock : 0)} ${unit}`
                  })()}
                </h3>
              </div>

              {/* Driver Details Sheet */}
              <div className="bg-white border rounded shadow-subtle p-4 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-bold text-gray-700 uppercase">Driver Info</span>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={handleEdit} className="p-1">
                      <Edit size={12} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDelete}
                      className="p-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span className="font-bold text-gray-700">{selectedDriver.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Phone:</span>
                    <span className="text-gray-700 font-mono">{selectedDriver.phone || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status:</span>
                    <span className="font-bold text-gray-700">{selectedDriver.status || 'ACTIVE'}</span>
                  </div>
                  {selectedDriver.notes && (
                    <div className="pt-1 border-t">
                      <span className="text-gray-400 block mb-0.5">Notes:</span>
                      <p className="text-gray-600 italic bg-gray-50 p-1.5 rounded">{selectedDriver.notes}</p>
                    </div>
                  )}
                </div>

                {/* Statement Link Button */}
                <div className="pt-2">
                  <Button variant="primary" size="sm" onClick={handleOpenStatement} className="w-full gap-2">
                    <FileText size={13} />
                    <span>Generate Driver statement</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed rounded p-8 text-center text-gray-400 text-xs">
              <User className="mx-auto mb-2 opacity-50" size={32} />
              Select a driver profile from the registry list to inspect balances, edit attributes, or generate detailed ledger statements.
            </div>
          )}
        </div>
      </div>

      {/* Form Editor Modal (Create/Edit) */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 select-none">
          <div className="bg-white border rounded-lg shadow-xl w-96 p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-gray-700 uppercase">
                {editId ? 'Modify Driver Profile' : 'Register New Driver'}
              </span>
              <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Driver Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. +1 (555) 123-4567"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Status</label>
                <Select
                  options={[
                    { value: 'ACTIVE', label: 'Active Operator' },
                    { value: 'INACTIVE', label: 'Suspended / Inactive' },
                  ]}
                  value={formData.status}
                  onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Internal Notes</label>
                <textarea
                  placeholder="License expiration dates, compliance tracking notes..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Commit Record
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Statement Modal */}
      {isStatementOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:bg-white print:inset-auto print:static">
          <div className="bg-white border rounded-lg shadow-2xl w-[95vw] max-w-6xl h-[85vh] flex flex-col p-6 space-y-4 print:w-full print:h-auto print:border-none print:shadow-none print:p-0">
            {/* Modal Header (Hidden on print) */}
            <div className="flex items-center justify-between border-b pb-2 print:hidden select-none">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-gray-700 uppercase">Driver Statement Report Generator</span>
                <p className="text-[10px] text-gray-400">Inspecting transaction history running balances for driver ledger auditing.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                  <Printer size={13} />
                  <span>Print</span>
                </Button>
                <Button variant="primary" size="sm" onClick={handleExportInventoryPDF} className="gap-2">
                  <Download size={13} />
                  <span>Inventory PDF</span>
                </Button>
                <Button variant="primary" size="sm" onClick={handleExportSalesPDF} className="gap-2">
                  <Download size={13} />
                  <span>Sales PDF</span>
                </Button>
                <button onClick={() => setIsStatementOpen(false)} className="text-gray-400 hover:text-gray-600 ml-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b print:hidden select-none">
              <button
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
                  statementTab === 'inventory'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setStatementTab('inventory')}
              >
                Inventory Statement (Stock Movement)
              </button>
              <button
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
                  statementTab === 'sales'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setStatementTab('sales')}
              >
                Sales Statement (Profit Margin)
              </button>
            </div>

            {/* Date Filtering (Hidden on print) */}
            <div className="flex items-end gap-3 bg-gray-50 border p-3 rounded print:hidden select-none">
              <div className="space-y-1 flex-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">From Date</label>
                <input
                  type="date"
                  className="w-full px-2.5 py-1 text-xs bg-white border border-gray-300 rounded focus:outline-none"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1 flex-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">To Date</label>
                <input
                  type="date"
                  className="w-full px-2.5 py-1 text-xs bg-white border border-gray-300 rounded focus:outline-none"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button variant="primary" size="sm" onClick={handleOpenStatement}>
                Query Range
              </Button>
            </div>

            {/* Report Content */}
            {statementLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs">
                <RefreshCw size={24} className="animate-spin mb-2" />
                Querying database ledger entries...
              </div>
            ) : statementReport ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-4">
                {/* Print Title Block */}
                <div className="border-b-2 pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-lg font-black text-gray-800 uppercase tracking-tight">Malak Enterprise ERP</h1>
                      <p className="text-[10px] text-gray-400">
                        {statementTab === 'inventory' ? 'Driver Stock Ledger Statement' : 'Driver Sales Ledger Statement'}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p><span className="text-gray-400">Driver:</span> <strong className="text-gray-700">{statementReport.driverName}</strong></p>
                      <p><span className="text-gray-400">Statement Period:</span> <strong className="text-gray-700">{statementReport.startDate || 'Creation'} to {statementReport.endDate || 'Present'}</strong></p>
                    </div>
                  </div>
                </div>

                {/* Summary cards section */}
                {statementTab === 'inventory' ? (
                  <div className="grid grid-cols-5 gap-4 bg-gray-50 border p-3 rounded">
                    <div className="text-center border-r">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Opening Stock</span>
                      <p className="text-sm font-bold text-gray-800">
                        {FormattingService.formatQuantity(statementReport.openingBalance)}
                      </p>
                    </div>
                    <div className="text-center border-r">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Total Qty In</span>
                      <p className="text-sm font-bold text-green-700">
                        {FormattingService.formatQuantity(statementReport.totalQtyIn || 0)}
                      </p>
                    </div>
                    <div className="text-center border-r">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Total Qty Out</span>
                      <p className="text-sm font-bold text-purple-700">
                        {FormattingService.formatQuantity(statementReport.totalQtyOut || 0)}
                      </p>
                    </div>
                    <div className="text-center border-r">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Closing Stock</span>
                      <p className="text-sm font-bold text-gray-800">
                        {FormattingService.formatQuantity(statementReport.closingBalance)}
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Average Buy Cost</span>
                      <p className="text-sm font-bold text-blue-600">
                        {statementReport.averageBuyCost > 0 ? FormattingService.formatRate(statementReport.averageBuyCost) : '-'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4 bg-gray-50 border p-3 rounded">
                    <div className="text-center border-r">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Total Sold Volume</span>
                      <p className="text-sm font-bold text-gray-800">
                        {FormattingService.formatQuantity(salesSummary.totalVol)}
                      </p>
                    </div>
                    <div className="text-center border-r">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Total Sales Amount</span>
                      <p className="text-sm font-bold text-green-700">
                        {FormattingService.formatCurrency(salesSummary.totalSales)}
                      </p>
                    </div>
                    <div className="text-center border-r">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Total Cost</span>
                      <p className="text-sm font-bold text-purple-700">
                        {FormattingService.formatCurrency(salesSummary.totalCost)}
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Total Profit</span>
                      <p className="text-sm font-bold text-blue-600">
                        {FormattingService.formatCurrency(salesSummary.totalProfit)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Transactions list */}
                <div className="flex-1 min-h-0">
                  <DataGrid
                    columns={statementTab === 'inventory' ? statementColumns : salesColumns}
                    data={statementTab === 'inventory' ? statementReport.lines : salesLines}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
                Select a valid date range and run query.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
