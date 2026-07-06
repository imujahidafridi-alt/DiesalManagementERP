import { useState, useMemo, useEffect } from 'react'
import { Button, Select } from '@/components/ui'
import { useUiStore, useAppStore } from '@/store'
import { FormattingService } from '@/utils/FormattingService'
import {
  Upload,
  ArrowRight,
  ChevronLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Play,
  FileSpreadsheet,
} from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

interface TempImportRow {
  rowNumber: number
  sourceFile: string
  date: string
  driverName: string
  fromTo: string
  qtyIn: number
  qtyOut: number
  rate: number
  vehicle: string
  type: 'PURCHASE' | 'TRANSFER' | 'SALE' | 'UNKNOWN'
  selected: boolean
  hasError: boolean
  errorReason?: string
  hasWarning: boolean
  warningReason?: string
}

export default function ImportWizardPage() {
  const { addToast } = useUiStore()
  const { fetchDrivers, fetchSuppliers, fetchCustomers, drivers, suppliers, customers } = useAppStore()

  // Stepper State: 1 (Upload), 2 (Preview & Validate), 3 (Executing), 4 (Complete)
  const [step, setStep] = useState<number>(1)
  const [sourceFile, setSourceFile] = useState<string>('')
  
  // Worksheets in case of Excel
  const [workbooks, setWorkbooks] = useState<any>(null)
  const [sheetsList, setSheetsList] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')

  // Rows parsed and mapped dynamically
  const [rawRowsData, setRawRowsData] = useState<any[][]>([])
  const [workbookType, setWorkbookType] = useState<'A' | 'B' | 'UNKNOWN'>('UNKNOWN')
  const [detectedHeaderIndex, setDetectedHeaderIndex] = useState<number>(-1)
  const [detectedColumns, setDetectedColumns] = useState<Record<string, string>>({})
  const [verifiedRows, setVerifiedRows] = useState<TempImportRow[]>([])

  // Missing Master Data Trackers
  const [missingDrivers, setMissingDrivers] = useState<string[]>([])
  const [missingSuppliers, setMissingSuppliers] = useState<string[]>([])
  const [missingCustomers, setMissingCustomers] = useState<string[]>([])
  const [autoCreateMasters, setAutoCreateMasters] = useState<boolean>(true)

  // Progress monitoring
  const [progress, setProgress] = useState<number>(0)
  const [importStats, setImportStats] = useState<{ imported: number; errors: string[] } | null>(null)

  // Fetch registers on mount to ensure cache is hot for validation
  useEffect(() => {
    Promise.all([fetchDrivers(), fetchSuppliers(), fetchCustomers()]).catch(console.error)
  }, [])

  // Dynamic Header Row Discovery & Workbook Type Detection (Type A vs Type B)
  const findHeaderRow = (sheetData: any[][]): { headerIndex: number; mappings: Record<string, string>; keys: string[]; workbookType: 'A' | 'B' } | null => {
    const patterns = {
      date: /^(date)$/i,
      driverName: /^(driver|driver\s*name|drivername)$/i,
      fromTo: /^(from\/to|from\s*to|supplier|party|description|customer|supplier\/customer)$/i,
      qtyIn: /^(gallon\s*in|gallonin|qty\s*in|purchase\s*qty)$/i,
      qtyOut: /^(gallon\s*sold|qty\s*out|sold\s*qty)$/i,
      rate: /^(buy\s*rate|rate|purchase\s*rate)$/i,
      soldRate: /^(sold\s*rate|sale\s*rate|selling\s*rate)$/i,
      vehicle: /^(plate\s*no|plate|vehicle\s*no)$/i,
    }

    for (let r = 0; r < Math.min(sheetData.length, 30); r++) {
      const row = sheetData[r]
      if (!row || !Array.isArray(row)) continue

      let matchCount = 0
      let hasSoldRate = false
      const mappings: Record<string, string> = {}
      const keys: string[] = []

      row.forEach((cellVal) => {
        if (cellVal === undefined || cellVal === null) return
        const cellStr = String(cellVal).trim()
        if (!cellStr) return

        keys.push(cellStr)

        if (patterns.date.test(cellStr)) {
          mappings.date = cellStr
          matchCount++
        } else if (patterns.driverName.test(cellStr)) {
          mappings.driverName = cellStr
          matchCount++
        } else if (patterns.fromTo.test(cellStr)) {
          mappings.fromTo = cellStr
          matchCount++
        } else if (patterns.qtyIn.test(cellStr)) {
          mappings.qtyIn = cellStr
          matchCount++
        } else if (patterns.qtyOut.test(cellStr)) {
          mappings.qtyOut = cellStr
          matchCount++
        } else if (patterns.rate.test(cellStr)) {
          mappings.rate = cellStr
          matchCount++
        } else if (patterns.soldRate.test(cellStr)) {
          mappings.soldRate = cellStr
          hasSoldRate = true
          matchCount++
        } else if (patterns.vehicle.test(cellStr)) {
          mappings.vehicle = cellStr
          matchCount++
        }
      })

      if (matchCount >= 3) {
        return { headerIndex: r, mappings, keys, workbookType: hasSoldRate ? 'B' : 'A' }
      }
    }

    return null
  }

  // Date normalization helper
  const parseNormalizedDate = (rawVal: any): string | null => {
    if (rawVal === undefined || rawVal === null) return null
    const str = String(rawVal).trim()
    if (!str) return null

    // 1. Excel serial date number
    if (/^\d+(\.\d+)?$/.test(str)) {
      const serial = parseFloat(str)
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    }

    // 2. DD/MM/YYYY or D/M/YYYY
    const dmyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
    const match = str.match(dmyPattern)
    if (match) {
      const day = parseInt(match[1], 10)
      const month = parseInt(match[2], 10)
      const year = parseInt(match[3], 10)
      const date = new Date(year, month - 1, day)
      if (!isNaN(date.getTime())) {
        const y = String(year)
        const m = String(month).padStart(2, '0')
        const d = String(day).padStart(2, '0')
        return `${y}-${m}-${d}`
      }
    }

    // 3. ISO Date format YYYY-MM-DD
    const date = new Date(str)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }

    return null
  }

  // Handle parsing with Type A / Type B support and stop-at-empty row constraints
  const processRawDataRows = (sheetData: any[][], filename: string) => {
    const headerDetection = findHeaderRow(sheetData)
    if (!headerDetection) {
      addToast('Could not automatically locate the header row (requires Date, Driver, and Qty columns)', 'error')
      return
    }

    const { headerIndex, mappings, keys, workbookType: detectedType } = headerDetection
    setDetectedHeaderIndex(headerIndex)
    setDetectedColumns(mappings)
    setWorkbookType(detectedType)

    // Slice rows below the header, limit processing on 5 consecutive empty rows
    const parsedRows: any[] = []
    let consecutiveEmptyCount = 0

    for (let r = headerIndex + 1; r < sheetData.length; r++) {
      const row = sheetData[r]
      const isEmpty = !row || !Array.isArray(row) || row.every((cell) => cell === undefined || cell === null || String(cell).trim() === '')

      if (isEmpty) {
        consecutiveEmptyCount++
        if (consecutiveEmptyCount >= 5) {
          break
        }
        continue
      }

      consecutiveEmptyCount = 0

      const obj: Record<string, any> = {}
      keys.forEach((key, colIdx) => {
        obj[key] = row[colIdx] !== undefined ? row[colIdx] : ''
      })
      parsedRows.push(obj)
    }

    const activeDrivers = new Set(drivers.map((d) => d.name.toLowerCase().trim()))
    const activeSuppliers = new Set(suppliers.map((s) => s.companyName.toLowerCase().trim()))
    const activeCustomers = new Set(customers.map((c) => c.companyName.toLowerCase().trim()))

    const missingDrvsMap = new Map<string, string>() // lowercase -> original case
    const missingSupsMap = new Map<string, string>()
    const missingCustsMap = new Map<string, string>()

    const verified = parsedRows.map((row, idx) => {
      const rowNum = headerIndex + idx + 2 // absolute row number in spreadsheet

      const rawDate = row[mappings.date] !== undefined ? String(row[mappings.date]).trim() : ''
      const rawDriver = row[mappings.driverName] !== undefined ? String(row[mappings.driverName]).trim() : ''
      const rawFromTo = row[mappings.fromTo] !== undefined ? String(row[mappings.fromTo]).trim() : ''
      
      const qtyIn = parseFloat(row[mappings.qtyIn]) || 0
      const qtyOut = parseFloat(row[mappings.qtyOut]) || 0
      const buyRate = parseFloat(row[mappings.rate]) || 0
      const soldRate = mappings.soldRate ? (parseFloat(row[mappings.soldRate]) || 0) : 0
      
      // Treat plate numbers as raw string text
      const vehicle = row[mappings.vehicle] !== undefined ? String(row[mappings.vehicle]).trim() : ''

      // Normalize date layout
      const date = parseNormalizedDate(rawDate) || ''

      // Detect transaction type
      let type: 'PURCHASE' | 'TRANSFER' | 'SALE' | 'UNKNOWN' = 'UNKNOWN'
      let unknownReason = ''

      if (detectedType === 'A') {
        if (qtyIn > 0 && qtyOut === 0 && !rawFromTo.toLowerCase().startsWith('to ')) {
          type = 'PURCHASE'
        } else if (qtyOut > 0 && rawFromTo.toLowerCase().startsWith('to ')) {
          type = 'TRANSFER'
        } else {
          type = 'UNKNOWN'
          if (!date) unknownReason = 'Invalid or missing Date format'
          else if (!rawDriver) unknownReason = 'Missing Driver Name'
          else if (!rawFromTo) unknownReason = 'From/TO description column is blank'
          else if (qtyIn <= 0 && qtyOut <= 0) unknownReason = 'Both Gallon In and Gallon Sold are zero or empty'
          else if (qtyIn > 0 && qtyOut > 0) unknownReason = 'Conflicting quantity values (both positive In and Out columns)'
          else unknownReason = 'Workbook Type A: Transfers must start with "TO "'
        }
      } else { // detectedType === 'B'
        if (qtyIn > 0 && qtyOut === 0) {
          type = 'PURCHASE'
        } else if (qtyOut > 0 && soldRate > 0) {
          type = 'SALE'
        } else {
          type = 'UNKNOWN'
          if (!date) unknownReason = 'Invalid or missing Date format'
          else if (!rawDriver) unknownReason = 'Missing Driver Name'
          else if (!rawFromTo) unknownReason = 'Supplier/Customer description column is blank'
          else if (qtyIn <= 0 && qtyOut <= 0) unknownReason = 'Both Qty In and Qty Out are zero or empty'
          else if (qtyOut > 0 && soldRate <= 0) unknownReason = 'Sale requires a positive Sold Rate value'
          else unknownReason = 'Workbook Type B classification rules mismatch'
        }
      }

      let hasError = false
      let errorReason = ''
      let hasWarning = false
      let warningReason = ''

      // Validate Date
      if (!date) {
        hasError = true
        errorReason = 'Invalid Date Format (Requires DD/MM/YYYY or YYYY-MM-DD)'
      }

      // Validate Master Entities References
      if (!hasError && type === 'UNKNOWN') {
        hasError = true
        errorReason = `Unknown Row Type: ${unknownReason}`
      }

      // Map appropriate rate for database execution (Buy Rate vs Selling Rate)
      const rate = type === 'SALE' ? soldRate : buyRate

      if (!hasError) {
        const driverNameClean = rawDriver.toLowerCase().trim()
        const fromToClean = rawFromTo.toLowerCase().trim()

        if (!rawDriver) {
          hasError = true
          errorReason = 'Driver name is required'
        } else if (!activeDrivers.has(driverNameClean)) {
          if (!missingDrvsMap.has(driverNameClean)) {
            missingDrvsMap.set(driverNameClean, rawDriver)
          }
          hasWarning = true
          warningReason = `New Driver "${rawDriver}" will be registered.`
        }

        if (!hasError && type === 'PURCHASE') {
          if (!rawFromTo) {
            hasError = true
            errorReason = 'Supplier name is required for Purchase'
          } else if (!activeSuppliers.has(fromToClean)) {
            if (autoCreateMasters) {
              if (!missingSupsMap.has(fromToClean)) {
                missingSupsMap.set(fromToClean, rawFromTo)
              }
              hasWarning = true
              warningReason = `New Supplier "${rawFromTo}" will be registered.`
            } else {
              hasError = true
              errorReason = `Supplier "${rawFromTo}" does not exist in registry`
            }
          }
          if (qtyIn <= 0) {
            hasError = true
            errorReason = 'Purchase volume must be positive'
          }
          if (rate <= 0) {
            hasError = true
            errorReason = 'Buy rate must be positive'
          }
        }

        if (!hasError && type === 'SALE') {
          if (!rawFromTo) {
            hasError = true
            errorReason = 'Customer name is required for Sale'
          } else if (!activeCustomers.has(fromToClean)) {
            if (autoCreateMasters) {
              if (!missingCustsMap.has(fromToClean)) {
                missingCustsMap.set(fromToClean, rawFromTo)
              }
              hasWarning = true
              warningReason = `New Customer "${rawFromTo}" will be registered.`
            } else {
              hasError = true
              errorReason = `Customer "${rawFromTo}" does not exist in registry`
            }
          }
          if (qtyOut <= 0) {
            hasError = true
            errorReason = 'Sale volume must be positive'
          }
          if (rate <= 0) {
            hasError = true
            errorReason = 'Selling rate must be positive'
          }
        }

        if (!hasError && type === 'TRANSFER') {
          const destDriver = rawFromTo.replace(/^to\s+/i, '').toLowerCase().trim()
          const rawDestDriver = rawFromTo.replace(/^to\s+/i, '').trim()
          if (!destDriver) {
            hasError = true
            errorReason = 'Destination driver is required for Transfer'
          } else if (!activeDrivers.has(destDriver)) {
            if (autoCreateMasters) {
              if (!missingDrvsMap.has(destDriver)) {
                missingDrvsMap.set(destDriver, rawDestDriver)
              }
              hasWarning = true
              warningReason = `Destination Driver "${rawDestDriver}" will be registered.`
            } else {
              hasError = true
              errorReason = `Destination Driver "${rawDestDriver}" does not exist`
            }
          }
          if (qtyOut <= 0) {
            hasError = true
            errorReason = 'Transfer volume must be positive'
          }
        }
      }

      return {
        rowNumber: rowNum,
        sourceFile: filename,
        date,
        driverName: rawDriver,
        fromTo: rawFromTo,
        qtyIn,
        qtyOut,
        rate,
        vehicle,
        type,
        selected: !hasError,
        hasError,
        errorReason,
        hasWarning,
        warningReason,
      }
    })

    setMissingDrivers(Array.from(missingDrvsMap.values()))
    setMissingSuppliers(Array.from(missingSupsMap.values()))
    setMissingCustomers(Array.from(missingCustsMap.values()))
    setVerifiedRows(verified)
    setStep(2)
  }

  // Step 1: Upload and Read workbook/CSV
  const handleFileChange = (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSourceFile(file.name)
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

    if (isExcel) {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        setWorkbooks(workbook)
        setSheetsList(workbook.SheetNames)
        setSelectedSheet(workbook.SheetNames[0])
        
        // Load rows from first sheet as array of arrays
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const sheetData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' })
        setRawRowsData(sheetData)
      }
      reader.readAsArrayBuffer(file)
    } else {
      // PapaParse for CSV as array of arrays
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const sheetData = results.data as any[][]
          setRawRowsData(sheetData)
          processRawDataRows(sheetData, file.name)
        },
        error: (err) => {
          addToast(err.message || 'Failed to parse CSV file', 'error')
        }
      })
    }
  }

  // Trigger preview on sheet change
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName)
    const sheet = workbooks.Sheets[sheetName]
    const sheetData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' })
    setRawRowsData(sheetData)
  }

  // Re-run validation checks dynamically when autoCreateMasters toggles
  useEffect(() => {
    if (rawRowsData.length > 0 && sourceFile) {
      processRawDataRows(rawRowsData, sourceFile)
    }
  }, [autoCreateMasters])

  // Preview Grid summary counts
  const previewSummary = useMemo(() => {
    let purchases = 0
    let transfers = 0
    let sales = 0
    let unknown = 0
    let errors = 0
    let warnings = 0
    let selected = 0

    verifiedRows.forEach((r) => {
      if (r.type === 'PURCHASE') purchases++
      else if (r.type === 'TRANSFER') transfers++
      else if (r.type === 'SALE') sales++
      else unknown++

      if (r.hasError) errors++
      if (r.hasWarning) warnings++
      if (r.selected) selected++
    })

    return {
      total: verifiedRows.length,
      purchases,
      transfers,
      sales,
      unknown,
      errors,
      warnings,
      selected,
    }
  }, [verifiedRows])

  // Execute actual transactional batch import
  const handleStartImport = async () => {
    const activeRows = verifiedRows.filter((r) => r.selected)
    if (activeRows.length === 0) {
      addToast('No active rows selected for import', 'error')
      return
    }

    const needsMasterCreation = missingDrivers.length > 0 || missingSuppliers.length > 0 || missingCustomers.length > 0
    if (needsMasterCreation && !autoCreateMasters) {
      addToast('Please confirm auto-creation of missing records, or deselect those rows', 'error')
      return
    }

    setStep(3)
    setProgress(15)

    let progressTimer: any = null

    try {
      const user = localStorage.getItem('diesel_user') || 'ERP Operator'
      
      // Simulate smooth progress loading while executing IPC
      progressTimer = setInterval(() => {
        setProgress((prev) => (prev < 90 ? prev + 8 : prev))
      }, 300)

      // Set a 60-second timeout to prevent hanging indefinitely
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Import execution timed out after 60 seconds.')), 60000)
      )

      const result = await Promise.race([
        window.api.invoke('import:smartExecute', activeRows, user, autoCreateMasters),
        timeoutPromise
      ]) as any
      
      setProgress(100)
      setImportStats({ imported: result.imported, errors: result.errors })
      setStep(4)
      addToast('Smart import completed successfully!', 'success')
    } catch (e: any) {
      addToast(e.message || 'Smart import failed. Transactions rolled back.', 'error')
      setStep(2)
    } finally {
      if (progressTimer) {
        clearInterval(progressTimer)
      }
    }
  }

  return (
    <div className="bg-white border rounded shadow-subtle min-h-[calc(100vh-7rem)] flex flex-col font-sans select-none">
      {/* Top Banner Header */}
      <div className="p-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-black uppercase text-gray-800 tracking-wider">Smart Import Wizard</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">Upload multi-ledger Excel spreadsheets and CSV reports with automatic balance recalculation.</p>
        </div>
        {step > 1 && (
          <div className="flex gap-2">
            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-200 uppercase">
              Step {step} of 4
            </span>
          </div>
        )}
      </div>

      {/* STEP 1: UPLOAD PAGE */}
      {step === 1 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <div className="p-5 bg-blue-50/50 rounded-full border border-blue-100 text-blue-600 animate-pulse">
            <Upload size={40} />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-sm font-black text-gray-700 uppercase">Select ledger source file</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              We support Excel (<strong>.xlsx, .xls</strong>) and CSV (<strong>.csv</strong>) layouts. Balance, totals, and running formula columns are filtered out automatically.
            </p>
          </div>

          <div className="flex flex-col items-center space-y-4">
            <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 w-80 hover:border-blue-400 hover:bg-blue-50/10 cursor-pointer transition-all">
              <Upload size={22} className="text-gray-400 mb-1.5" />
              <span className="text-xs font-bold text-gray-500">Browse Files</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        </div>
      )}

      {/* SHEET SELECTOR IN STEP 1 (EXCEL WORKBOOKS) */}
      {step === 1 && sheetsList.length > 0 && (
        <div className="border-t p-4 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={16} className="text-green-600" />
            <div>
              <span className="text-xs font-bold text-gray-700">{sourceFile}</span>
              <p className="text-[10px] text-gray-400">Excel contains {sheetsList.length} worksheets.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase">Select Sheet:</span>
            <Select
              options={sheetsList.map((s) => ({ value: s, label: s }))}
              value={selectedSheet}
              onChange={(e: any) => handleSheetChange(e.target.value)}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => processRawDataRows(rawRowsData, sourceFile)}
              className="gap-1"
            >
              <span>Preview Sheet</span>
              <ArrowRight size={12} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW & VERIFY GRID */}
      {step === 2 && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary KPI aggregates banner */}
          <div className="p-3 border-b bg-gray-50 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 shrink-0 text-center font-mono">
            <div className="bg-white border rounded py-1.5">
              <span className="text-[8px] text-gray-400 font-bold uppercase block font-sans">Total Rows</span>
              <span className="text-xs font-black text-gray-800">{previewSummary.total}</span>
            </div>
            <div className="bg-white border border-green-200 bg-green-50/10 rounded py-1.5">
              <span className="text-[8px] text-green-600 font-bold uppercase block font-sans">Purchases</span>
              <span className="text-xs font-black text-green-700">{previewSummary.purchases}</span>
            </div>
            <div className="bg-white border border-blue-200 bg-blue-50/10 rounded py-1.5">
              <span className="text-[8px] text-blue-600 font-bold uppercase block font-sans">Transfers</span>
              <span className="text-xs font-black text-blue-700">{previewSummary.transfers}</span>
            </div>
            <div className="bg-white border border-purple-200 bg-purple-50/10 rounded py-1.5">
              <span className="text-[8px] text-purple-600 font-bold uppercase block font-sans">Sales</span>
              <span className="text-xs font-black text-purple-700">{previewSummary.sales}</span>
            </div>
            <div className="bg-white border border-yellow-200 bg-yellow-50/10 rounded py-1.5">
              <span className="text-[8px] text-yellow-600 font-bold uppercase block font-sans">Unknowns</span>
              <span className="text-xs font-black text-yellow-700">{previewSummary.unknown}</span>
            </div>
            <div className="bg-white border border-red-200 bg-red-50/10 rounded py-1.5">
              <span className="text-[8px] text-red-600 font-bold uppercase block font-sans">Errors</span>
              <span className="text-xs font-black text-red-700">{previewSummary.errors}</span>
            </div>
            <div className="bg-white border border-amber-200 bg-amber-50/10 rounded py-1.5">
              <span className="text-[8px] text-amber-600 font-bold uppercase block font-sans">Warnings</span>
              <span className="text-xs font-black text-amber-700">{previewSummary.warnings}</span>
            </div>
            <div className="bg-blue-600 text-white rounded py-1.5">
              <span className="text-[8px] text-blue-100 font-bold uppercase block font-sans">Importing</span>
              <span className="text-xs font-black">{previewSummary.selected} / {previewSummary.total}</span>
            </div>
          </div>

          {/* Discovered Header Row Index and column mappings */}
          <div className="p-3 border-b bg-blue-50/20 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 text-xs">
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-bold">
                Header Row: {detectedHeaderIndex >= 0 ? `Row ${detectedHeaderIndex + 1}` : 'Not Detected'}
              </span>
              <span className="bg-green-100 text-green-850 px-2 py-0.5 rounded font-mono font-bold border border-green-200">
                Workbook Type: {workbookType === 'A' ? 'Type A (Transfers)' : workbookType === 'B' ? 'Type B (Sales)' : 'Unknown'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-gray-400 font-bold uppercase text-[9px] mr-1">Mappings:</span>
              {Object.entries(detectedColumns).map(([dbField, excelCol]) => (
                <span key={dbField} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded border text-[10px]">
                  {dbField} → <strong className="text-blue-600">{excelCol}</strong>
                </span>
              ))}
            </div>
          </div>

          {/* Missing Master Records Notice */}
          {(missingDrivers.length > 0 || missingSuppliers.length > 0 || missingCustomers.length > 0) && (
            <div className="p-3 border-b bg-amber-50/40 flex items-center justify-between shrink-0">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                <div className="text-left">
                  <span className="text-[11px] font-bold text-amber-800 block">Missing Master Records Detected</span>
                  <p className="text-[10px] text-amber-600 leading-tight">
                    The source references {missingDrivers.length} new Drivers, {missingSuppliers.length} new Suppliers, and {missingCustomers.length} new Customers.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-white border border-amber-200 px-3 py-1 rounded shadow-sm text-xs">
                <input
                  type="checkbox"
                  checked={autoCreateMasters}
                  onChange={(e) => setAutoCreateMasters(e.target.checked)}
                />
                <span className="font-bold text-amber-700">Auto-create Master Records (Drivers, Suppliers, Customers)</span>
              </label>
            </div>
          )}

          {/* Data grid preview */}
          <div className="flex-1 overflow-auto p-4 bg-gray-50/10">
            <table className="w-full text-xs text-left border rounded border-collapse bg-white">
              <thead>
                <tr className="bg-gray-100 text-[10px] text-gray-500 font-bold border-b select-none">
                  <th className="p-2 w-12 text-center">Import</th>
                  <th className="p-2 w-16 text-center">Row</th>
                  <th className="p-2 w-28">Date</th>
                  <th className="p-2 w-32">Driver</th>
                  <th className="p-2 w-44">From / To</th>
                  <th className="p-2 w-28 text-right">Qty In</th>
                  <th className="p-2 w-28 text-right">Qty Out</th>
                  <th className="p-2 w-24 text-right">Rate</th>
                  <th className="p-2 w-28">Vehicle</th>
                  <th className="p-2 w-24 text-center">Type</th>
                  <th className="p-2">Status / Messages</th>
                </tr>
              </thead>
              <tbody>
                {verifiedRows.map((row, idx) => {
                  const handleCheckboxToggle = () => {
                    const updated = [...verifiedRows]
                    updated[idx].selected = !updated[idx].selected
                    setVerifiedRows(updated)
                  }

                  return (
                    <tr
                      key={row.rowNumber}
                      className={`border-b hover:bg-gray-50/50 ${
                        row.hasError ? 'bg-red-50/15' : row.hasWarning ? 'bg-amber-50/15' : ''
                      }`}
                    >
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          disabled={row.hasError}
                          checked={row.selected}
                          onChange={handleCheckboxToggle}
                        />
                      </td>
                      <td className="p-2 text-center text-gray-400 font-mono">{row.rowNumber}</td>
                      <td className="p-2">{row.date || <span className="text-red-500 font-bold">MISSING</span>}</td>
                      <td className="p-2 font-bold">{row.driverName || '-'}</td>
                      <td className="p-2">{row.fromTo || '-'}</td>
                      <td className="p-2 text-right font-mono text-green-700">
                        {row.qtyIn > 0 ? FormattingService.formatQuantity(row.qtyIn) : '-'}
                      </td>
                      <td className="p-2 text-right font-mono text-purple-700">
                        {row.qtyOut > 0 ? FormattingService.formatQuantity(row.qtyOut) : '-'}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {row.rate > 0 ? FormattingService.formatRate(row.rate * 100) : '-'}
                      </td>
                      <td className="p-2 font-mono">{row.vehicle || '-'}</td>
                      <td className="p-2 text-center font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] ${
                            row.type === 'PURCHASE'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : row.type === 'SALE'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : row.type === 'TRANSFER'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                          }`}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="p-2 font-medium">
                        {row.hasError ? (
                          <span className="text-red-600 flex items-center gap-1">
                            <XCircle size={12} className="shrink-0" />
                            <span>{row.errorReason}</span>
                          </span>
                        ) : row.hasWarning ? (
                          <span className="text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={12} className="shrink-0" />
                            <span>{row.warningReason}</span>
                          </span>
                        ) : (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle size={12} className="shrink-0" />
                            <span>Ready</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Step 2 Bottom Controls */}
          <div className="border-t p-3 bg-gray-50 flex items-center justify-between shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(1)}
              className="gap-1"
            >
              <ChevronLeft size={12} />
              <span>Back</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartImport}
              className="gap-1"
            >
              <Play size={12} />
              <span>Start Recalculate & Import</span>
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: EXECUTING PROGRESS PAGE */}
      {step === 3 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
          <div className="w-80 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase">
              <span>Recalculating WAC & Balances</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-gray-400 text-center italic mt-1.5">
              Executing transactional inserts and re-building chronological stocks ledger snapshots. Do not close the app.
            </p>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS SUMMARY PAGE */}
      {step === 4 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 select-none animate-fade-in">
          <div className="p-5 bg-green-50 rounded-full border border-green-200 text-green-600">
            <CheckCircle size={40} />
          </div>
          
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-sm font-black text-gray-700 uppercase">Ledger Import Completed!</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Successfully processed and recalculated balances for the entire dataset inside a safe, atomic database transaction wrapper.
            </p>
          </div>

          <div className="bg-gray-50 border rounded-lg p-4 w-72 grid grid-cols-2 gap-4 font-mono text-center shadow-inner">
            <div className="border-r">
              <span className="text-[9px] text-gray-400 font-sans block uppercase font-bold">Imported Rows</span>
              <span className="text-base font-black text-green-700">{importStats?.imported}</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-400 font-sans block uppercase font-bold">Errors Thrown</span>
              <span className="text-base font-black text-gray-800">{importStats?.errors.length || 0}</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSheetsList([])
              setVerifiedRows([])
              setSourceFile('')
              setStep(1)
            }}
            className="gap-1"
          >
            <span>Import another file</span>
            <ArrowRight size={12} />
          </Button>
        </div>
      )}
    </div>
  )
}
