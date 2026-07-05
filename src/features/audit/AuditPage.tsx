import { useState, useEffect, useMemo } from 'react'
import { Button, DataGrid, useShortcutEffect, Select } from '@/components/ui'
import { useUiStore } from '@/store'
import {
  Search,
  RefreshCw,
  Download,
  Printer,
  Eye,
} from 'lucide-react'
import type { GridColumn } from '@/components/ui/DataGrid'

export default function AuditPage() {
  const { addToast } = useUiStore()

  const [loading, setLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  
  // Filters State
  const [searchQuery, setSearchQuery] = useState('')
  const [actionType, setActionType] = useState('')
  const [entityName, setEntityName] = useState('')
  const [datePreset, setDatePreset] = useState('this_month')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Diff Modal State
  const [selectedLog, setSelectedLog] = useState<any | null>(null)
  const [isDiffOpen, setIsDiffOpen] = useState(false)

  // Trigger Date preset changes
  useEffect(() => {
    const today = new Date()
    let start = ''
    let end = today.toISOString().split('T')[0]

    switch (datePreset) {
      case 'today':
        start = end
        break
      case 'yesterday':
        const yest = new Date()
        yest.setDate(today.getDate() - 1)
        start = yest.toISOString().split('T')[0]
        end = start
        break
      case 'last_7_days':
        const l7 = new Date()
        l7.setDate(today.getDate() - 6)
        start = l7.toISOString().split('T')[0]
        break
      case 'this_month':
        start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
        break
      default:
        start = ''
        end = ''
    }

    setStartDate(start)
    setEndDate(end)
  }, [datePreset])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const list = await window.api.invoke('audit:list')
      setAuditLogs(list || [])
    } catch (e: any) {
      addToast(e.message || 'Failed to load audit logs', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  useShortcutEffect('refresh', loadLogs)

  // Filter logs locally for instant feedback
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const q = searchQuery.toLowerCase().trim()
      
      // Text search: matches operator, entity name, entity ID, or raw contents
      const matchesSearch =
        !q ||
        log.user.toLowerCase().includes(q) ||
        log.entityName.toLowerCase().includes(q) ||
        log.entityId.toLowerCase().includes(q) ||
        (log.previousData && log.previousData.toLowerCase().includes(q)) ||
        (log.newData && log.newData.toLowerCase().includes(q))

      const matchesAction = !actionType || log.action === actionType
      const matchesEntity = !entityName || log.entityName === entityName

      // Date Range Filter
      const logDate = log.timestamp.split('T')[0]
      const matchesStart = !startDate || logDate >= startDate
      const matchesEnd = !endDate || logDate <= endDate

      return matchesSearch && matchesAction && matchesEntity && matchesStart && matchesEnd
    })
  }, [auditLogs, searchQuery, actionType, entityName, startDate, endDate])

  const handleOpenDiff = (log: any) => {
    setSelectedLog(log)
    setIsDiffOpen(true)
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      addToast('No data available to export', 'error')
      return
    }
    const headers = 'Timestamp,Operator,Action,Module/Entity,Entity UUID'
    const rows = filteredLogs.map((log) => {
      return `"${log.timestamp}","${log.user}","${log.action}","${log.entityName}","${log.entityId}"`
    })
    const csvContent = [headers, ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`)
    link.click()
    addToast('CSV export downloaded', 'success')
  }

  // Visual Diff JSON formatter helper
  const renderJsonHelper = (raw: string | null) => {
    if (!raw) return <div className="text-gray-400 italic">Empty Record / Created new</div>
    try {
      const parsed = JSON.parse(raw)
      return (
        <pre className="text-[10px] text-gray-700 bg-gray-50 p-2 border rounded font-mono overflow-auto max-h-80 whitespace-pre-wrap">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )
    } catch {
      return <pre className="text-[10px] text-gray-700 bg-gray-50 p-2 border rounded font-mono overflow-auto max-h-80 whitespace-pre-wrap">{raw}</pre>
    }
  }

  const columns: GridColumn<any>[] = [
    { key: 'timestamp', header: 'Timestamp Date-Time', width: 145 },
    { key: 'user', header: 'Operator', width: 110 },
    {
      key: 'action',
      header: 'Action',
      width: 95,
      render: (row) => (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          row.action === 'CREATE' ? 'bg-green-50 text-green-700 border border-green-200' :
          row.action === 'UPDATE' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
          row.action === 'DELETE' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-purple-50 text-purple-700 border border-purple-200'
        }`}>
          {row.action}
        </span>
      )
    },
    { key: 'entityName', header: 'Module/Entity', width: 110 },
    { key: 'entityId', header: 'Entity UUID', width: 230 },
    {
      key: 'actions',
      header: 'Details',
      width: 80,
      render: (row) => (
        <button
          onClick={() => handleOpenDiff(row)}
          className="flex items-center gap-1 px-1.5 py-0.5 border rounded text-[10px] font-bold text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
        >
          <Eye size={11} />
          <span>Diff</span>
        </button>
      )
    }
  ]

  return (
    <div className="space-y-4">
      {/* Page Header (no-print) */}
      <div className="flex items-center justify-between no-print select-none shrink-0">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900">Security Audit Center</h1>
          <p className="text-[11px] text-gray-500">Examine detailed structural trace records of user activities, data additions, updates, and deletes.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
            <Download size={13} />
            <span>CSV Export</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
            <Printer size={13} />
            <span>Print Trail</span>
          </Button>

          <Button variant="outline" size="sm" onClick={loadLogs} className="gap-2">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh <kbd className="text-[9px] text-gray-400 font-mono ml-1">Ctrl+R</kbd></span>
          </Button>
        </div>
      </div>

      {/* Filters Panel (no-print) */}
      <div className="p-4 bg-white border rounded shadow-subtle grid grid-cols-2 md:grid-cols-5 gap-3 no-print select-none shrink-0">
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-gray-400 uppercase">Text Search</label>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Operator, UUID, content..."
              className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-gray-50 border rounded focus:ring-1 focus:ring-blue-500 focus:outline-none select-text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-gray-400 uppercase">Action Type</label>
          <Select
            options={[
              { value: '', label: 'All Actions' },
              { value: 'CREATE', label: 'CREATE' },
              { value: 'UPDATE', label: 'UPDATE' },
              { value: 'DELETE', label: 'DELETE' },
              { value: 'RESTORE', label: 'RESTORE' },
            ]}
            value={actionType}
            onChange={(e: any) => setActionType(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-gray-400 uppercase">Module Registry</label>
          <Select
            options={[
              { value: '', label: 'All registries' },
              { value: 'drivers', label: 'Drivers' },
              { value: 'customers', label: 'Customers' },
              { value: 'suppliers', label: 'Suppliers' },
              { value: 'vehicles', label: 'Vehicles' },
              { value: 'transactions', label: 'Transactions' },
            ]}
            value={entityName}
            onChange={(e: any) => setEntityName(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-gray-400 uppercase">Date Range</label>
          <Select
            options={[
              { value: 'this_month', label: 'This Month' },
              { value: 'today', label: 'Today Only' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'last_7_days', label: 'Last 7 Days' },
              { value: 'all', label: 'All Dates' },
            ]}
            value={datePreset}
            onChange={(e: any) => setDatePreset(e.target.value)}
          />
        </div>

        <div className="flex items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('')
              setActionType('')
              setEntityName('')
              setDatePreset('this_month')
            }}
            className="w-full"
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="bg-white border rounded shadow-subtle p-4 print:p-0 print:border-0 print:shadow-none">
        {/* Print Header */}
        <div className="print-only hidden select-none p-4 border-b-2 mb-4">
          <h2 className="text-sm font-black uppercase text-gray-900">Malak Enterprise System Audit Trail</h2>
          <div className="text-[10px] text-gray-500 font-mono mt-1">
            Print Date: {new Date().toLocaleString()} | Loaded Records: {filteredLogs.length}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-xs">
            <RefreshCw className="animate-spin mb-2" size={16} />
            Loading security logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-12 select-none border border-dashed rounded bg-gray-50">
            No audit records match your current filters.
          </div>
        ) : (
          <DataGrid
            columns={columns}
            data={filteredLogs}
          />
        )}
      </div>

      {/* Side-by-Side Visual Diff Modal overlay */}
      {isDiffOpen && selectedLog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 select-none animate-fade-in">
          <div className="bg-white border rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 bg-gray-50 border-b flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">Visual Change Analyzer</h3>
                <p className="text-[10px] text-gray-500 font-medium">
                  Registry: <span className="font-bold text-gray-700 uppercase">{selectedLog.entityName}</span> | Action: <span className="font-bold text-blue-600">{selectedLog.action}</span> | Operator: <span className="font-bold text-gray-700">{selectedLog.user}</span>
                </p>
              </div>
              <button
                onClick={() => setIsDiffOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold border rounded px-2 py-1 bg-white hover:bg-gray-50 cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Side-by-side Panes Content */}
            <div className="flex-1 overflow-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Previous State */}
              <div className="space-y-1.5 flex flex-col min-w-0">
                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">Previous Data State (-)</span>
                <div className="flex-1 overflow-auto">
                  {renderJsonHelper(selectedLog.previousData)}
                </div>
              </div>

              {/* New State */}
              <div className="space-y-1.5 flex flex-col min-w-0">
                <span className="text-[9px] font-bold text-green-600 uppercase tracking-wide">New Data State (+)</span>
                <div className="flex-1 overflow-auto">
                  {renderJsonHelper(selectedLog.newData)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
