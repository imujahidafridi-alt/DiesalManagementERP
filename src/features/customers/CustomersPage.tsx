import React, { useState, useEffect, useMemo } from 'react'
import { useAppStore, useUiStore } from '@/store'
import Logo from '@/components/common/Logo'
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

interface CustomerFormData {
  companyName: string
  contactPerson: string
  phone: string
  email: string
  address: string
  taxNumber: string
  status: 'ACTIVE' | 'INACTIVE'
  notes: string
}

const emptyForm: CustomerFormData = {
  companyName: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  taxNumber: '',
  status: 'ACTIVE',
  notes: '',
}

export default function CustomersPage() {
  const { currencySymbol: symbol, quantityAbbreviation: unit } = useBusinessSettings()
  const {
    customers,
    loadingCustomers,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerStatementReport,
  } = useAppStore()

  const { addToast, showDialog } = useUiStore()

  // Selection states
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Form states
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<CustomerFormData>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)

  // Statement report states
  const [isStatementOpen, setIsStatementOpen] = useState(false)
  const [statementReport, setStatementReport] = useState<any | null>(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(() => FormattingService.getLocalDateString())

  const { activeLookupId, setActiveLookupId } = useUiStore()

  useEffect(() => {
    fetchCustomers()
  }, [])

  const parseCustomer = (c: any): any => {
    if (c.notes && c.notes.startsWith('{')) {
      try {
        const parsed = JSON.parse(c.notes)
        return {
          ...c,
          email: parsed.email || '',
          taxNumber: parsed.taxNumber || '',
          status: parsed.status || 'ACTIVE',
          notes: parsed.notes || '',
        }
      } catch (e) {
        // ignore
      }
    }
    return {
      ...c,
      email: '',
      taxNumber: '',
      status: 'ACTIVE',
      notes: c.notes || '',
    }
  }

  const parsedCustomers = useMemo(() => {
    return customers.map(parseCustomer)
  }, [customers])

  useEffect(() => {
    if (activeLookupId && customers.length > 0) {
      const match = parsedCustomers.find((c) => c.id === activeLookupId)
      if (match) {
        setSelectedCustomer(match)
        setActiveLookupId(null)
      }
    }
  }, [activeLookupId, customers, parsedCustomers])

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return parsedCustomers.filter((c) => {
      return (
        c.companyName.toLowerCase().includes(query) ||
        (c.contactPerson || '').toLowerCase().includes(query) ||
        (c.phone || '').toLowerCase().includes(query) ||
        (c.email || '').toLowerCase().includes(query) ||
        (c.notes || '').toLowerCase().includes(query)
      )
    })
  }, [parsedCustomers, searchQuery])

  // --- Actions ---
  const handleRefresh = async () => {
    await fetchCustomers()
    addToast('Customer directory refreshed', 'success')
  }

  const handleNew = () => {
    setFormData(emptyForm)
    setEditId(null)
    setIsEditing(true)
  }

  const handleEdit = () => {
    if (!selectedCustomer) return
    setFormData({
      companyName: selectedCustomer.companyName,
      contactPerson: selectedCustomer.contactPerson || '',
      phone: selectedCustomer.phone || '',
      email: selectedCustomer.email || '',
      address: selectedCustomer.address || '',
      taxNumber: selectedCustomer.taxNumber || '',
      status: (selectedCustomer.status as any) || 'ACTIVE',
      notes: selectedCustomer.notes || '',
    })
    setEditId(selectedCustomer.id)
    setIsEditing(true)
  }

  const handleDelete = () => {
    if (!selectedCustomer) return
    showDialog({
      title: 'Archive Customer Profile',
      message: `Are you sure you want to soft-delete/archive customer profile "${selectedCustomer.companyName}"? This will disable them for future sales.`,
      type: 'delete',
      confirmText: 'Archive Customer',
      onConfirm: async () => {
        try {
          await deleteCustomer(selectedCustomer.id)
          addToast('Customer archived successfully', 'success')
          setSelectedCustomer(null)
        } catch (err: any) {
          addToast(err.message || 'Error archiving customer', 'error')
        }
      },
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.companyName.trim()) {
      addToast('Customer company name is required', 'error')
      return
    }

    const serializedNotes = JSON.stringify({
      email: formData.email || '',
      taxNumber: formData.taxNumber || '',
      status: formData.status || 'ACTIVE',
      notes: formData.notes || '',
    })

    try {
      if (editId) {
        const res = await updateCustomer(editId, {
          companyName: formData.companyName,
          contactPerson: formData.contactPerson || null,
          phone: formData.phone || null,
          address: formData.address || null,
          notes: serializedNotes,
        })
        setSelectedCustomer(parseCustomer(res))
        addToast('Customer profile updated', 'success')
      } else {
        const res = await createCustomer({
          companyName: formData.companyName,
          contactPerson: formData.contactPerson || null,
          phone: formData.phone || null,
          address: formData.address || null,
          notes: serializedNotes,
        })
        setSelectedCustomer(parseCustomer(res))
        addToast('Customer profile created', 'success')
      }
      setIsEditing(false)
    } catch (err: any) {
      addToast(err.message || 'Error saving customer', 'error')
    }
  }

  // --- Statement Generation ---
  const handleOpenStatement = async () => {
    if (!selectedCustomer) return
    setStatementLoading(true)
    setIsStatementOpen(true)
    try {
      const filters = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }
      const rep = await getCustomerStatementReport(selectedCustomer.id, filters)
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

  const handleExportPDF = () => {
    if (!statementReport || statementReport.lines.length === 0) return

    PdfService.generateReportPDF('customer_ledger_detail', statementReport.lines, {
      startDate,
      endDate,
      companyName: 'Sahara Diesels',
      title: 'Customer Ledger Statement',
      partyName: statementReport.companyName,
      operator: localStorage.getItem('diesel_user') || 'ERP Operator',
      openingBalance: statementReport.openingBalance,
    })
  }

  // Register shortcuts
  useShortcutEffect('new', handleNew)
  useShortcutEffect('refresh', handleRefresh)

  // Directory Columns
  const columns: GridColumn<any>[] = [
    { key: 'companyName', header: 'Company Name', width: 180 },
    { key: 'contactPerson', header: 'Contact Person', width: 140 },
    { key: 'phone', header: 'Phone Number', width: 120 },
    { key: 'email', header: 'Email Address', width: 150 },
    {
      key: 'status',
      header: 'Status',
      width: 90,
      render: (row) => (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${row.status === 'ACTIVE' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-gray-50 border border-gray-200 text-gray-700'
            }`}
        >
          {row.status || 'ACTIVE'}
        </span>
      ),
    },
  ]

  // Statement Columns
  const statementColumns = useMemo((): GridColumn<any>[] => [
    { key: 'transactionNumber', header: 'Invoice No', width: 100 },
    { key: 'transactionDate', header: 'Date', width: 90 },
    { key: 'transactionType', header: 'Type', width: 100 },
    { key: 'driverName', header: 'Delivered By Driver', width: 160 },
    { key: 'quantity', header: `Volume (${unit})`, width: 95, type: 'number' },
    { key: 'sellingRate', header: 'Selling Price', width: 90, type: 'currency' },
    { key: 'totalAmount', header: 'Total Invoiced', width: 110, type: 'currency' },
    { key: 'referenceNumber', header: 'Ref Number', width: 100 },
    { key: 'runningVolume', header: `Running Vol (${unit})`, width: 110, type: 'number' },
    { key: 'runningBalance', header: `Running Bal (${symbol})`, width: 110, type: 'currency' },
  ], [unit, symbol])

  return (
    <div className="space-y-4">
      {/* 1. Toolbar */}
      <div className="flex items-center justify-between border-b pb-3 select-none bg-white p-3.5 rounded border shadow-subtle">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNew} className="gap-2">
            <Plus size={13} />
            <span>New Customer <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+N</kbd></span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw size={13} className={loadingCustomers ? 'animate-spin' : ''} />
            <span>Refresh <kbd className="text-[10px] font-mono opacity-60 ml-1">Ctrl+R</kbd></span>
          </Button>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer profiles..."
            className="w-full pl-8 pr-3 py-1 bg-gray-50 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left Column: Customer Grid */}
        <div className="col-span-2 space-y-2">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider select-none">
            Customer Directory Registry
          </div>
          <DataGrid
            columns={columns}
            data={filteredCustomers}
            onSelectionChange={(selected) => {
              if (selected.length > 0) {
                setSelectedCustomer(selected[0])
              } else {
                setSelectedCustomer(null)
              }
            }}
          />
        </div>

        {/* Right Column: Customer Details */}
        <div className="space-y-4">
          {selectedCustomer ? (
            <div className="space-y-4">
              {/* Profile Card */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded shadow-subtle p-4 select-none relative overflow-hidden">
                <div className="absolute right-[-10px] bottom-[-10px] opacity-10 text-green-900 pointer-events-none">
                  <User size={120} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 block">
                  Customer Profile Sheet
                </span>
                <h3 className="text-xl font-black text-green-950 mt-1">
                  {selectedCustomer.companyName}
                </h3>
                <div className="flex items-center gap-1.5 mt-3 text-xs text-green-700">
                  <User size={14} />
                  <span>Contact: {selectedCustomer.contactPerson || 'N/A'}</span>
                </div>
              </div>

              {/* Detail list */}
              <div className="bg-white border rounded shadow-subtle p-4 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-bold text-gray-700 uppercase">Profile Details</span>
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
                    <span className="text-gray-400">Phone:</span>
                    <span className="text-gray-700 font-mono">{selectedCustomer.phone || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Email:</span>
                    <span className="text-gray-700">{selectedCustomer.email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tax ID:</span>
                    <span className="text-gray-700 font-mono">{selectedCustomer.taxNumber || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Address:</span>
                    <span className="text-gray-700 text-right">{selectedCustomer.address || 'N/A'}</span>
                  </div>
                  {selectedCustomer.notes && (
                    <div className="pt-2 border-t">
                      <span className="text-gray-400 block mb-0.5">Notes:</span>
                      <p className="text-gray-600 italic bg-gray-50 p-1.5 rounded">{selectedCustomer.notes}</p>
                    </div>
                  )}
                </div>

                {/* Ledger button */}
                <div className="pt-2">
                  <Button variant="primary" size="sm" onClick={handleOpenStatement} className="w-full gap-2">
                    <FileText size={13} />
                    <span>Generate Customer Ledger Statement</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed rounded p-8 text-center text-gray-400 text-xs">
              <User className="mx-auto mb-2 opacity-50" size={32} />
              Select a customer profile to manage assignments, view contact details, or generate printable financial statements.
            </div>
          )}
        </div>
      </div>

      {/* Form Editor Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 select-none">
          <div className="bg-white border rounded-lg shadow-xl w-96 p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-gray-700 uppercase">
                {editId ? 'Modify Customer Profile' : 'Register New Customer Account'}
              </span>
              <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Allied Transport LLC"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. Alice Smith"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. +1 (555) 987-6543"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. accounts@allied.com"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Tax ID / Number</label>
                <input
                  type="text"
                  placeholder="Tax reference compliance ID..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.taxNumber}
                  onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Billing Address</label>
                <input
                  type="text"
                  placeholder="Street name, City..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Status</label>
                <Select
                  options={[
                    { value: 'ACTIVE', label: 'Active Account' },
                    { value: 'INACTIVE', label: 'Suspended / Inactive' },
                  ]}
                  value={formData.status}
                  onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Internal Notes</label>
                <textarea
                  placeholder="Special pricing agreements or terms..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Save Customer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Statement Modal */}
      {isStatementOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:bg-white print:inset-auto print:static">
          <div className="bg-white border rounded-lg shadow-2xl w-[95vw] max-w-7xl h-[85vh] flex flex-col p-6 space-y-4 print:w-full print:h-auto print:border-none print:shadow-none print:p-0">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-2 print:hidden select-none">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-gray-700 uppercase">Customer Ledger Account Statement</span>
                <p className="text-[10px] text-gray-400">Auditable log of purchases, returns, and outstanding receivables ledger lines.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                  <Printer size={13} />
                  <span>Print</span>
                </Button>
                <Button variant="primary" size="sm" onClick={handleExportPDF} className="gap-2">
                  <Download size={13} />
                  <span>Export PDF</span>
                </Button>
                <button onClick={() => setIsStatementOpen(false)} className="text-gray-400 hover:text-gray-600 ml-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Range Filters */}
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

            {/* Content */}
            {statementLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs">
                <RefreshCw size={24} className="animate-spin mb-2" />
                Aggregating customer accounts transactions...
              </div>
            ) : statementReport ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-4">
                {/* Print Header */}
                <div className="flex justify-between items-start w-full border-b border-gray-300 pb-4 mb-4 print:flex print:justify-between print:items-start print:w-full print:border-b print:border-gray-300 print:pb-4 print:mb-4">
                  {/* Left Column: Brand Identity */}
                  <div className="flex flex-col print:flex print:flex-col">
                    <Logo className="h-10 w-auto self-start print:h-10 print:w-auto print:self-start" />
                    <span className="text-[10px] font-black text-gray-600 mt-1.5 uppercase tracking-wider print:text-[10px] print:font-black print:text-gray-600 print:mt-1.5 print:uppercase print:tracking-wider">
                      Sahara Group General Transport
                    </span>
                  </div>

                  {/* Right Column: Report Meta Data */}
                  <div className="flex flex-col text-right items-end print:flex print:flex-col print:text-right print:items-end">
                    <h1 className="text-xl font-bold text-gray-900 print:text-xl print:font-bold print:text-gray-900">
                      Customer Account Statement
                    </h1>
                    <p className="text-sm font-semibold text-gray-700 mt-1 print:text-sm print:font-semibold print:text-gray-700 print:mt-1">
                      Party Name: {statementReport.companyName} {statementReport.customerName ? `(${statementReport.customerName})` : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 print:text-xs print:text-gray-500 print:mt-1">
                      Date Range: {statementReport.startDate || 'Account Creation'} to {statementReport.endDate || 'Present'}
                    </p>
                    <div className="text-[10px] text-gray-400 mt-2 print:text-[10px] print:text-gray-400 print:mt-2 space-y-0.5">
                      <p>Generated By: {localStorage.getItem('diesel_user') || 'ERP Operator'}</p>
                      <p>Generated On: {new Date().toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Lifetime Widget summaries */}
                <div className="grid grid-cols-4 gap-4 bg-gray-50 border p-3 rounded">
                  <div className="text-center border-r">
                    <span className="text-[9px] uppercase font-bold text-gray-400">Lifetime Volume</span>
                    <p className="text-xs font-bold text-gray-800">{FormattingService.formatQuantity(statementReport.summary.lifetimeVolume)}</p>
                  </div>
                  <div className="text-center border-r">
                    <span className="text-[9px] uppercase font-bold text-gray-400">Lifetime Purchases</span>
                    <p className="text-xs font-bold text-gray-800">{FormattingService.formatCurrency(statementReport.summary.lifetimeAmount)}</p>
                  </div>
                  <div className="text-center border-r">
                    <span className="text-[9px] uppercase font-bold text-gray-400">Avg Purchase Rate</span>
                    <p className="text-xs font-bold text-blue-600">{FormattingService.formatRate(statementReport.summary.averagePrice)}</p>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] uppercase font-bold text-gray-400">Last Purchase Date</span>
                    <p className="text-xs font-bold text-gray-800">{statementReport.summary.lastPurchaseDate || 'Never'}</p>
                  </div>
                </div>

                {/* Ledger Balances Widget */}
                <div className="grid grid-cols-3 gap-4 bg-blue-50/50 border border-blue-200 p-3 rounded">
                  <div className="text-center border-r border-blue-200">
                    <span className="text-[9px] uppercase font-bold text-blue-500">Opening Balance ({symbol})</span>
                    <p className="text-sm font-bold text-blue-900">{FormattingService.formatCurrency(statementReport.openingBalance)}</p>
                  </div>
                  <div className="text-center border-r border-blue-200">
                    <span className="text-[9px] uppercase font-bold text-blue-500">Net Period Activity</span>
                    <p className="text-sm font-bold text-blue-700">
                      {FormattingService.formatCurrency(statementReport.closingBalance - statementReport.openingBalance)}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] uppercase font-bold text-blue-500">Closing Balance ({symbol})</span>
                    <p className="text-sm font-bold text-blue-900">{FormattingService.formatCurrency(statementReport.closingBalance)}</p>
                  </div>
                </div>

                {/* Statement Table */}
                <div className="flex-1 min-h-0">
                  <DataGrid
                    columns={statementColumns}
                    data={statementReport.lines}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
                Select a valid date range to query accounting statements.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
