import { useState, useMemo } from 'react'
import { Button, Select } from '@/components/ui'
import { useUiStore } from '@/store'
import { useBusinessSettings } from '@/hooks/useBusinessSettings'
import {
  Upload,
  ArrowRight,
  ChevronLeft,
  CheckCircle,
  AlertTriangle,
  Check,
} from 'lucide-react'

// Fields required per entity type
const getSchemaFields = (symbol: string, unit: string): Record<string, { key: string; label: string; required: boolean }[]> => ({
  DRIVER: [
    { key: 'name', label: 'Driver Name', required: true },
    { key: 'phone', label: 'Phone Number', required: false },
    { key: 'address', label: 'Home Address', required: false },
    { key: 'notes', label: 'Remarks Notes', required: false },
  ],
  CUSTOMER: [
    { key: 'companyName', label: 'Company Name', required: true },
    { key: 'contactPerson', label: 'Contact Person', required: false },
    { key: 'phone', label: 'Phone Number', required: false },
    { key: 'address', label: 'Business Address', required: false },
    { key: 'email', label: 'Email (Virtual)', required: false },
    { key: 'taxNumber', label: 'Tax ID (Virtual)', required: false },
    { key: 'notes', label: 'Remarks Notes', required: false },
  ],
  SUPPLIER: [
    { key: 'companyName', label: 'Company Name', required: true },
    { key: 'contactPerson', label: 'Contact Person', required: false },
    { key: 'phone', label: 'Phone Number', required: false },
    { key: 'address', label: 'Supplier Address', required: false },
    { key: 'notes', label: 'Remarks Notes', required: false },
  ],
  VEHICLE: [
    { key: 'plateNumber', label: 'Plate Number', required: true },
    { key: 'capacity', label: `Volume Capacity (${unit})`, required: true },
    { key: 'description', label: 'Truck Description', required: false },
  ],
  PURCHASE: [
    { key: 'transactionDate', label: 'Date (YYYY-MM-DD)', required: true },
    { key: 'supplierId', label: 'Supplier Name/ID', required: true },
    { key: 'quantity', label: `Volume (${unit})`, required: true },
    { key: 'unitCost', label: `Unit Cost (${symbol})`, required: true },
    { key: 'destinationLocation', label: 'Driver Name/ID', required: true },
    { key: 'referenceNumber', label: 'Vehicle Number', required: true },
    { key: 'notes', label: 'Remarks Notes', required: false },
  ],
  SALE: [
    { key: 'transactionDate', label: 'Date (YYYY-MM-DD)', required: true },
    { key: 'driverId', label: 'Driver Name/ID', required: true },
    { key: 'customerId', label: 'Customer Name/ID', required: true },
    { key: 'quantity', label: `Volume (${unit})`, required: true },
    { key: 'sellingRate', label: `Selling Rate (${symbol})`, required: true },
    { key: 'referenceNumber', label: 'Delivery Ref No', required: false },
    { key: 'notes', label: 'Remarks Notes', required: false },
  ],
  TRANSFER: [
    { key: 'transactionDate', label: 'Date (YYYY-MM-DD)', required: true },
    { key: 'fromLocation', label: 'From Driver Name/ID', required: true },
    { key: 'toLocation', label: 'To Driver Name/ID', required: true },
    { key: 'quantity', label: `Volume (${unit})`, required: true },
    { key: 'referenceNumber', label: 'Gate Pass Ref No', required: false },
    { key: 'notes', label: 'Remarks Notes', required: false },
  ],
})

export default function ImportWizardPage() {
  const { currencySymbol: symbol, quantityAbbreviation: unit } = useBusinessSettings()
  const schemaFields = useMemo(() => getSchemaFields(symbol, unit), [symbol, unit])
  const { addToast } = useUiStore()

  // Stepper State: 1 (Upload), 2 (Mapping), 3 (Preview & Execute), 4 (Errors), 5 (Summary)
  const [step, setStep] = useState<number>(1)
  const [entityType, setEntityType] = useState<string>('DRIVER')
  
  // Parsed raw csv items
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [parsedRows, setParsedRows] = useState<any[]>([])

  // Column Mapping State: map db schema key to csv header index/name
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  // Execution outputs
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    failed: number
    executionTimeMs: number
    errors: string[]
  } | null>(null)

  // ----------------------------------------------------
  // ROBUST CLIENT SIDE CSV PARSER
  // ----------------------------------------------------
  const handleFileChange = (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      // Split rows correctly supporting carriage returns
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length === 0) {
        addToast('Selected CSV file is empty', 'error')
        return
      }

      // Parse CSV commas correctly supporting double quotes
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false

        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      }

      const headers = parseCsvLine(lines[0])
      setCsvHeaders(headers)

      const rows = lines.slice(1).map((line) => {
        const cells = parseCsvLine(line)
        const rowObj: Record<string, string> = {}
        headers.forEach((h, i) => {
          rowObj[h] = cells[i] || ''
        })
        return rowObj
      })

      setParsedRows(rows)

      // Guess initial mapping by matching lowercase string names
      const initialMap: Record<string, string> = {}
      const targetFields = schemaFields[entityType] || []
      
      targetFields.forEach((field) => {
        const match = headers.find(
          (h) => h.toLowerCase() === field.key.toLowerCase() || h.toLowerCase() === field.label.toLowerCase()
        )
        if (match) {
          initialMap[field.key] = match
        }
      })
      setColumnMapping(initialMap)
      setStep(2) // proceed to mapping step
    }

    reader.readAsText(file)
  }

  // Generate mapping previews
  const mappedPreviewRows = useMemo(() => {
    return parsedRows.slice(0, 5).map((row) => {
      const mapped: Record<string, any> = {}
      Object.entries(columnMapping).forEach(([dbKey, csvHeader]) => {
        mapped[dbKey] = row[csvHeader] || ''
      })
      return mapped
    })
  }, [parsedRows, columnMapping])

  // ----------------------------------------------------
  // RUN INTEGRATION EXECUTOR
  // ----------------------------------------------------
  const handleExecuteImport = async () => {
    setLoading(true)
    try {
      // Map all rows according to user mappings
      const mappedRows = parsedRows.map((row) => {
        const item: Record<string, any> = {}
        Object.entries(columnMapping).forEach(([dbKey, csvHeader]) => {
          item[dbKey] = row[csvHeader] || ''
        })
        return item
      })

      const user = localStorage.getItem('diesel_user') || 'ERP Operator'
      
      // Call IPC handler to validate and execute transaction bulk inserts
      const result = await window.api.invoke('import:execute', entityType, mappedRows, user)
      setImportResult(result)

      if (result.errors.length > 0) {
        addToast(`Validation errors blocked data import`, 'error')
        setStep(4) // show errors step
      } else {
        addToast(`Successfully imported ${result.imported} records`, 'success')
        setStep(5) // show summary step
      }
    } catch (e: any) {
      addToast(e.message || 'Fatal data import failure', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setCsvHeaders([])
    setParsedRows([])
    setColumnMapping({})
    setImportResult(null)
    setStep(1)
  }

  return (
    <div className="space-y-4 max-w-4xl select-none">
      {/* Page Header */}
      <div>
        <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900">Data Migration Wizard</h1>
        <p className="text-[11px] text-gray-500">Migrate legacy Excel spreadsheet accounts, vehicle tankers, customer profiles, and transaction records.</p>
      </div>

      {/* Stepper Progress bar indicators */}
      <div className="flex border rounded bg-white p-3 justify-between items-center text-xs font-semibold text-gray-400 shadow-subtle select-none">
        <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-blue-600 font-bold' : ''}`}>
          <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">1</span>
          <span>Upload File</span>
        </div>
        <ArrowRight size={13} className="text-gray-300" />
        
        <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-blue-600 font-bold' : ''}`}>
          <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">2</span>
          <span>Column Mapping</span>
        </div>
        <ArrowRight size={13} className="text-gray-300" />

        <div className={`flex items-center gap-1.5 ${step >= 3 ? 'text-blue-600 font-bold' : ''}`}>
          <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">3</span>
          <span>Validation & Run</span>
        </div>
        <ArrowRight size={13} className="text-gray-300" />

        <div className={`flex items-center gap-1.5 ${step >= 4 ? 'text-blue-600 font-bold' : ''}`}>
          <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">4</span>
          <span>Finish Logs</span>
        </div>
      </div>

      {/* STEP 1: Choose Entity and Upload */}
      {step === 1 && (
        <div className="border bg-white rounded p-6 shadow-subtle text-center space-y-6 max-w-xl mx-auto mt-6">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-gray-400 uppercase text-left">1. Select Target Registry Module</label>
            <Select
              options={[
                { value: 'DRIVER', label: 'Drivers Registry' },
                { value: 'CUSTOMER', label: 'Customers Credit Accounts' },
                { value: 'SUPPLIER', label: 'Suppliers Refinery Directory' },
                { value: 'VEHICLE', label: 'Vehicle Tankers' },
                { value: 'PURCHASE', label: 'Purchases Ledgers' },
                { value: 'SALE', label: 'Sales Ledgers' },
                { value: 'TRANSFER', label: 'Transfer Loadings' },
              ]}
              value={entityType}
              onChange={(e: any) => setEntityType(e.target.value)}
            />
          </div>

          <div className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-lg p-8 bg-gray-50/50 cursor-pointer relative group transition-colors">
            <input
              type="file"
              accept=".csv"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleFileChange}
            />
            <div className="flex flex-col items-center gap-2">
              <Upload size={28} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
              <span className="text-xs font-bold text-gray-700">Choose CSV Spreadsheet File</span>
              <p className="text-[10px] text-gray-400 leading-normal">
                Select a comma-separated values file (.csv) containing your migration columns.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Configure Column Mappings */}
      {step === 2 && (
        <div className="border bg-white rounded p-5 shadow-subtle space-y-5">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Map CSV Columns to Database Fields</h3>
            <span className="text-[10px] text-gray-400 font-bold uppercase">{entityType} Schema</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(schemaFields[entityType] || []).map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <Select
                  options={[
                    { value: '', label: '--- Ignore Field ---' },
                    ...csvHeaders.map((h) => ({ value: h, label: h })),
                  ]}
                  value={columnMapping[field.key] || ''}
                  onChange={(e: any) => setColumnMapping({ ...columnMapping, [field.key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          {/* Stepper buttons */}
          <div className="flex justify-between border-t pt-4">
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1">
              <ChevronLeft size={13} />
              <span>Back / Reset</span>
            </Button>
            <Button variant="primary" size="sm" onClick={() => setStep(3)} className="gap-1.5">
              <span>Preview Mapped Data</span>
              <ArrowRight size={13} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Preview Mapped Rows & Execute Import */}
      {step === 3 && (
        <div className="border bg-white rounded p-5 shadow-subtle space-y-5">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Migration Mapping Preview (First 5 Rows)</h3>
            <span className="text-[10px] text-blue-600 font-black">{parsedRows.length} Rows Pending</span>
          </div>

          <div className="overflow-x-auto border rounded">
            <table className="w-full text-left text-xs border-collapse font-medium">
              <thead>
                <tr className="bg-gray-100 border-b text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  {(schemaFields[entityType] || []).map((f) => (
                    <th key={f.key} className="p-2.5">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedPreviewRows.map((row: any, rIdx: number) => (
                  <tr key={rIdx} className="border-b bg-white hover:bg-gray-50/50">
                    {(schemaFields[entityType] || []).map((f: any) => (
                      <td key={f.key} className="p-2.5 font-mono text-[10px] select-text">{String(row[f.key] || '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setStep(2)} className="gap-1">
              <ChevronLeft size={13} />
              <span>Adjust Mappings</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={loading}
              onClick={handleExecuteImport}
              className="gap-2"
            >
              <CheckCircle size={13} />
              <span>Validate & Execute Import</span>
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Validation Errors Output */}
      {step === 4 && importResult && (
        <div className="border bg-white rounded p-5 shadow-subtle space-y-4 max-w-xl mx-auto mt-6">
          <div className="flex items-start gap-3.5 border-b border-red-100 pb-3 text-red-600">
            <AlertTriangle size={24} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-black uppercase tracking-wider">Validation Audit Blocked Import</h3>
              <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                Found {importResult.errors.length} validation failures. The entire import transaction was rolled back. No database rows were modified.
              </p>
            </div>
          </div>

          <div className="bg-red-50/50 border border-red-200 rounded p-4 text-[10px] text-red-800 font-mono leading-normal max-h-72 overflow-y-auto space-y-1.5 select-text">
            {importResult.errors.map((err, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="text-red-400 font-bold select-none">•</span>
                <span>{err}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2 select-none">
            <Button variant="outline" size="sm" onClick={() => setStep(3)}>
              Back to Preview
            </Button>
            <Button variant="primary" size="sm" onClick={handleReset}>
              Reset & Try Again
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5: Execution Summary Success Output */}
      {step === 5 && importResult && (
        <div className="border bg-white rounded p-6 shadow-subtle text-center space-y-5 max-w-md mx-auto mt-6">
          <div className="inline-flex p-3 bg-green-50 text-green-600 border border-green-200 rounded-full select-none">
            <Check size={28} />
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Migration Completed</h3>
            <p className="text-[10px] text-gray-500 leading-normal">
              All records imported and committed successfully. Downstream balances and average costs snapshots compiled.
            </p>
          </div>

          <div className="border rounded bg-gray-50 p-4 text-xs grid grid-cols-2 gap-3 text-left font-semibold text-gray-600">
            <div>Imported Records: <span className="font-bold text-gray-900">{importResult.imported}</span></div>
            <div>Skipped Records: <span className="font-bold text-gray-900">{importResult.skipped}</span></div>
            <div>Failed Records: <span className="font-bold text-gray-900">{importResult.failed}</span></div>
            <div>Execution Speed: <span className="font-bold text-gray-900">{importResult.executionTimeMs} ms</span></div>
          </div>

          <div className="pt-2 select-none">
            <Button variant="primary" size="sm" onClick={handleReset} className="w-full">
              Reset Wizard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
