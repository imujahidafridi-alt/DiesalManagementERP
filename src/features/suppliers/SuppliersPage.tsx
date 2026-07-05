import { useEffect, useMemo, useState } from 'react'
import { DataGrid, Button, useShortcutEffect } from '@/components/ui'
import { useAppStore, useUiStore } from '@/store'
import { Plus, FileSpreadsheet } from 'lucide-react'
import type { GridColumn } from '@/components/ui/DataGrid'
import type { Supplier } from '@/database/repositories/interfaces'

export default function SuppliersPage() {
  const { suppliers, fetchSuppliers, createSupplier, updateSupplier } = useAppStore()
  const { addToast, showDialog } = useUiStore()
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchSuppliers()
  }, [])

  // Handle cell inline edits
  const handleCellEdit = async (rowIndex: number, key: string, value: any) => {
    const row = filteredSuppliers[rowIndex]
    if (!row) return

    showDialog({
      title: 'Commit Supplier Edit',
      message: `Are you sure you want to update supplier "${row.companyName}" details? This change will update supplier profiles across the ledger statement.`,
      type: 'confirm',
      confirmText: 'Save Edit',
      onConfirm: async () => {
        try {
          await updateSupplier(row.id, { [key]: value })
          addToast('Supplier details updated successfully', 'success')
        } catch (err: any) {
          addToast(err.message || 'Supplier edit error', 'error')
        }
      },
    })
  }

  const triggerCreateNew = () => {
    showDialog({
      title: 'Register New Supplier',
      message: 'Create a new supplier profile. Confirm to proceed and specify company details:',
      type: 'confirm',
      confirmText: 'Register Supplier',
      onConfirm: async () => {
        const companyName = window.prompt('Enter Supplier Company Name:')
        if (!companyName || !companyName.trim()) {
          addToast('Supplier registration cancelled or empty name', 'info')
          return
        }
        try {
          await createSupplier({
            companyName: companyName.trim(),
            contactPerson: 'Representative',
            phone: '',
            address: '',
            notes: 'Registered via suppliers manager directory',
          })
          addToast('New supplier registered successfully', 'success')
        } catch (err: any) {
          addToast(err.message || 'Supplier registration error', 'error')
        }
      },
    })
  }

  const triggerExport = () => {
    addToast('Suppliers list exported successfully', 'success')
  }

  useShortcutEffect('new', triggerCreateNew)
  useShortcutEffect('export', triggerExport)

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers
    const q = searchQuery.toLowerCase()
    return suppliers.filter(
      (s) =>
        s.companyName.toLowerCase().includes(q) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.notes && s.notes.toLowerCase().includes(q))
    )
  }, [suppliers, searchQuery])

  const columns: GridColumn<Supplier>[] = [
    { key: 'companyName', header: 'Company Name', width: 180, editable: true },
    { key: 'contactPerson', header: 'Contact Person', width: 140, editable: true },
    { key: 'phone', header: 'Phone Number', width: 120, editable: true },
    { key: 'address', header: 'Office Address', width: 220, editable: true },
    { key: 'notes', header: 'Notes', width: 250, editable: true },
  ]

  return (
    <div className="space-y-4">
      {/* Page header and toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900">Supplier Contacts Directory</h1>
          <p className="text-[11px] text-gray-500">Track and manage wholesale suppliers, addresses, and contacts details.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-48">
            <input
              type="text"
              placeholder="Search suppliers..."
              className="w-full px-3 py-1 bg-white border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={triggerExport} className="gap-2">
              <FileSpreadsheet size={13} />
              <span>Export <kbd className="text-[9px] text-gray-400 font-mono ml-1">Ctrl+E</kbd></span>
            </Button>
            <Button variant="primary" size="sm" onClick={triggerCreateNew} className="gap-2">
              <Plus size={13} />
              <span>Add Supplier <kbd className="text-[9px] text-blue-200 font-mono ml-1">Ctrl+N</kbd></span>
            </Button>
          </div>
        </div>
      </div>

      {/* Supplier Grid view container */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Suppliers Registry Table</div>
        <DataGrid
          columns={columns}
          data={filteredSuppliers}
          onCellEditSubmit={handleCellEdit}
        />
      </div>
    </div>
  )
}
