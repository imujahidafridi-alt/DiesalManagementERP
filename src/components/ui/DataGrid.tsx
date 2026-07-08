import React, { useState, useEffect, useRef, useMemo } from 'react'
import clsx from 'clsx'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { FormattingService } from '@/utils/FormattingService'

export interface GridColumn<T> {
  key: string
  header: string
  width?: number
  sortable?: boolean
  editable?: boolean
  type?: 'text' | 'number' | 'currency'
  align?: 'left' | 'center' | 'right'
  render?: (row: T, rowIndex: number) => React.ReactNode
}

interface DataGridProps<T> {
  columns: GridColumn<T>[]
  data: T[]
  onCellEditSubmit?: (rowIndex: number, key: string, value: any) => void
  onSelectionChange?: (selectedRows: T[]) => void
  stickyFirstColumn?: boolean
  footerRow?: React.ReactNode
}

export default function DataGrid<T extends Record<string, any>>({
  columns,
  data,
  onCellEditSubmit,
  onSelectionChange,
  stickyFirstColumn = true,
  footerRow,
}: DataGridProps<T>) {
  // --- 1. States ---
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set())
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
  
  // Right-click context menu coords
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIndex: number } | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Initialize column widths from props
  useEffect(() => {
    const initialWidths: Record<string, number> = {}
    columns.forEach((col) => {
      initialWidths[col.key] = col.width || 120
    })
    setColWidths(initialWidths)
  }, [columns])

  // Focus editing input automatically
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

  // --- 2. Sorting Logic ---
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data
    
    return [...data].sort((a, b) => {
      const valA = a[sortKey]
      const valB = b[sortKey]

      if (valA === valB) return 0
      if (valA == null) return 1
      if (valB == null) return -1

      const comparison = typeof valA === 'string' 
        ? valA.localeCompare(valB) 
        : valA - valB
        
      return sortDir === 'asc' ? comparison : -comparison
    })
  }, [data, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else {
        setSortKey(null)
        setSortDir(null)
      }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // --- 3. Cell Edit Submissions ---
  const submitEdit = () => {
    if (!editingCell || !onCellEditSubmit) return
    const { rowIndex, colIndex } = editingCell
    const col = columns[colIndex]
    
    let parsedValue: any = editValue
    if (col.type === 'number' || col.type === 'currency') {
      const num = parseFloat(editValue.replace(/[$,]/g, ''))
      parsedValue = isNaN(num) ? 0 : num
    }

    onCellEditSubmit(rowIndex, col.key, parsedValue)
    setEditingCell(null)
  }

  const cancelEdit = () => {
    setEditingCell(null)
  }

  const startEditing = (rowIndex: number, colIndex: number) => {
    const col = columns[colIndex]
    if (!col.editable) return
    setEditingCell({ rowIndex, colIndex })
    setEditValue(String(sortedData[rowIndex]?.[col.key] ?? ''))
  }

  // --- 4. Keyboard Navigation Controls ---
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) {
      if (e.key === 'Enter') {
        submitEdit()
        // Move focus down to next row
        setFocusedCell((prev) =>
          prev ? { ...prev, rowIndex: Math.min(sortedData.length - 1, prev.rowIndex + 1) } : null
        )
        e.preventDefault()
      } else if (e.key === 'Escape') {
        cancelEdit()
        e.preventDefault()
      }
      return
    }

    if (!focusedCell) return

    const { rowIndex, colIndex } = focusedCell

    switch (e.key) {
      case 'ArrowDown':
        setFocusedCell({ ...focusedCell, rowIndex: Math.min(sortedData.length - 1, rowIndex + 1) })
        e.preventDefault()
        break
      case 'ArrowUp':
        setFocusedCell({ ...focusedCell, rowIndex: Math.max(0, rowIndex - 1) })
        e.preventDefault()
        break
      case 'ArrowRight':
        setFocusedCell({ ...focusedCell, colIndex: Math.min(columns.length - 1, colIndex + 1) })
        e.preventDefault()
        break
      case 'ArrowLeft':
        setFocusedCell({ ...focusedCell, colIndex: Math.max(0, colIndex - 1) })
        e.preventDefault()
        break
      case 'Tab':
        if (e.shiftKey) {
          // Move left
          if (colIndex > 0) {
            setFocusedCell({ rowIndex, colIndex: colIndex - 1 })
          } else if (rowIndex > 0) {
            setFocusedCell({ rowIndex: rowIndex - 1, colIndex: columns.length - 1 })
          }
        } else {
          // Move right
          if (colIndex < columns.length - 1) {
            setFocusedCell({ rowIndex, colIndex: colIndex + 1 })
          } else if (rowIndex < sortedData.length - 1) {
            setFocusedCell({ rowIndex: rowIndex + 1, colIndex: 0 })
          }
        }
        e.preventDefault()
        break
      case 'Enter':
      case 'F2':
        startEditing(rowIndex, colIndex)
        e.preventDefault()
        break
      case 'Backspace':
      case 'Delete':
        const col = columns[colIndex]
        if (col.editable && onCellEditSubmit) {
          onCellEditSubmit(rowIndex, col.key, col.type === 'number' || col.type === 'currency' ? 0 : '')
        }
        e.preventDefault()
        break
      case 'c':
        if (e.ctrlKey || e.metaKey) {
          // Copy active selection
          copySelection()
          e.preventDefault()
        }
        break
    }
  }

  // --- 5. Clipboard Helpers ---
  const copySelection = () => {
    if (selectedRowIndices.size === 0 && focusedCell) {
      // Copy single cell
      const row = sortedData[focusedCell.rowIndex]
      const col = columns[focusedCell.colIndex]
      navigator.clipboard.writeText(String(row[col.key] ?? ''))
      return
    }

    // Copy selected rows as TSV
    const rows = Array.from(selectedRowIndices).map((idx) => sortedData[idx])
    const lines = rows.map((row) =>
      columns.map((col) => String(row[col.key] ?? '')).join('\t')
    )
    navigator.clipboard.writeText(lines.join('\n'))
  }

  // --- 6. Mouse Selection ---
  const handleRowSelectToggle = (idx: number, e: React.MouseEvent) => {
    setSelectedRowIndices((prev) => {
      const next = new Set(prev)
      if (e.shiftKey && focusedCell) {
        // Range select
        next.clear()
        const start = Math.min(focusedCell.rowIndex, idx)
        const end = Math.max(focusedCell.rowIndex, idx)
        for (let i = start; i <= end; i++) next.add(i)
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(idx)) next.delete(idx)
        else next.add(idx)
      } else {
        next.clear()
        next.add(idx)
      }
      
      // Bubble changes
      if (onSelectionChange) {
        onSelectionChange(Array.from(next).map((i) => sortedData[i]))
      }
      return next
    })
  }

  // --- 7. Column Width Drag Resizing ---
  const handleResizeStart = (key: string, startX: number, startWidth: number) => {
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      setColWidths((prev) => ({
        ...prev,
        [key]: Math.max(50, startWidth + deltaX),
      }))
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Close context menu on outside click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  return (
    <div
      ref={gridRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="w-full border border-slate-200 rounded-none bg-white shadow-subtle overflow-auto max-h-[500px] md:max-h-full focus:outline-none focus:ring-2 focus:ring-blue-500/10"
    >
      <table className="w-full border-collapse table-fixed text-xs text-left">
        {/* Table Headers */}
        <thead className="sticky top-0 z-20 select-none border-b border-slate-950 bg-gradient-to-b from-slate-800 to-slate-900 text-[10px] font-bold text-white uppercase tracking-wider shadow-sm">
          <tr>
            {/* Index Checklist column */}
            <th className="w-10 text-center px-1 text-slate-300 font-mono text-[9px] py-2 bg-gradient-to-b from-slate-800 to-slate-900">
              #
            </th>

            {columns.map((col, cIdx) => {
              const isSorted = sortKey === col.key
              const isRightAlign = col.type === 'number' || col.type === 'currency' || col.align === 'right'
              const isCenterAlign = col.align === 'center'
              return (
                <th
                  key={col.key}
                  style={{ width: colWidths[col.key] || 120 }}
                  className={clsx(
                    'px-3 py-2 font-bold text-white relative align-middle group truncate bg-gradient-to-b from-slate-800 to-slate-900',
                    isRightAlign ? 'text-right' : isCenterAlign ? 'text-center' : 'text-left',
                    stickyFirstColumn && cIdx === 0 && 'sticky left-0 z-10 bg-gradient-to-b from-slate-800 to-slate-900'
                  )}
                >
                  <div className={clsx(
                    'flex items-center gap-1.5',
                    isRightAlign ? 'justify-end' : isCenterAlign ? 'justify-center' : 'justify-between'
                  )}>
                    <span
                      className={clsx(col.sortable && 'cursor-pointer select-none hover:text-white/80')}
                      onClick={() => col.sortable && toggleSort(col.key)}
                    >
                      {col.header}
                    </span>
                    {col.sortable && (
                      <span className="text-white/60">
                        {isSorted ? (
                          sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </span>
                    )}
                  </div>

                  {/* Resizing handler */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleResizeStart(col.key, e.clientX, colWidths[col.key] || 120)
                    }}
                    className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 transition-colors"
                  />
                </th>
              )
            })}
          </tr>
        </thead>

        {/* Table Body */}
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="py-8 text-center text-gray-400">
                No rows to display.
              </td>
            </tr>
          ) : (
            sortedData.map((row, rIdx) => {
              const isRowSelected = selectedRowIndices.has(rIdx)

              return (
                <tr
                  key={row.id || rIdx}
                  onClick={(e) => handleRowSelectToggle(rIdx, e)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, rowIndex: rIdx })
                  }}
                  className={clsx(
                    'border-b border-slate-100 transition-colors hover:bg-slate-50/60',
                    isRowSelected ? 'bg-blue-50/20 font-medium text-slate-900' : 'even:bg-slate-50/10'
                  )}
                >
                  {/* Row index indicator */}
                  <td className="px-1 text-center font-mono text-[9px] text-slate-400 py-1.5 bg-slate-50/30">
                    {rIdx + 1}
                  </td>

                  {columns.map((col, cIdx) => {
                    const isFocused = focusedCell?.rowIndex === rIdx && focusedCell?.colIndex === cIdx
                    const isEditing = editingCell?.rowIndex === rIdx && editingCell?.colIndex === cIdx
                    const isRightAlign = col.type === 'number' || col.type === 'currency' || col.align === 'right'
                    const isCenterAlign = col.align === 'center'
                    
                    return (
                      <td
                        key={col.key}
                        onClick={() => setFocusedCell({ rowIndex: rIdx, colIndex: cIdx })}
                        onDoubleClick={() => startEditing(rIdx, cIdx)}
                        className={clsx(
                          'px-3 py-1.5 truncate font-medium align-middle relative focus:outline-none text-[11px] text-slate-650',
                          isRightAlign ? 'text-right' : isCenterAlign ? 'text-center' : 'text-left',
                          stickyFirstColumn && cIdx === 0 && (
                            isRowSelected 
                              ? 'sticky left-0 bg-blue-50/30 z-10' 
                              : 'sticky left-0 bg-white z-10'
                          ),
                          {
                            'ring-1 ring-blue-500 ring-inset': isFocused && !isEditing,
                          }
                        )}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type={col.type === 'number' || col.type === 'currency' ? 'number' : 'text'}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={submitEdit}
                            className="absolute inset-0 w-full h-full px-3 py-1 text-xs border-none focus:ring-1 focus:ring-blue-600 focus:outline-none bg-white select-text"
                          />
                        ) : col.render ? (
                          col.render(row, rIdx)
                        ) : col.type === 'currency' ? (
                          FormattingService.formatCurrency(row[col.key] || 0)
                        ) : col.type === 'number' ? (
                          Number(row[col.key] || 0).toLocaleString()
                        ) : (
                          String(row[col.key] ?? '')
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
        {footerRow && (
          <tfoot className="sticky bottom-0 bg-gray-50 border-t z-10 font-bold select-none">
            {footerRow}
          </tfoot>
        )}
      </table>

      {/* Grid Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-white border rounded shadow-md py-1 min-w-[120px] select-none text-xs"
        >
          <div
            onClick={() => {
              setSelectedRowIndices(new Set([contextMenu.rowIndex]))
              copySelection()
            }}
            className="px-3 py-1.5 hover:bg-gray-100 cursor-pointer"
          >
            Copy Cell
          </div>
          <div
            onClick={() => {
              setSelectedRowIndices((prev) => {
                const next = new Set(prev)
                next.add(contextMenu.rowIndex)
                return next
              })
              copySelection()
            }}
            className="px-3 py-1.5 hover:bg-gray-100 cursor-pointer border-b"
          >
            Copy Selected Rows
          </div>
          <div
            onClick={() => {
              setSelectedRowIndices(new Set())
              setFocusedCell(null)
            }}
            className="px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-gray-500"
          >
            Clear Selection
          </div>
        </div>
      )}
    </div>
  )
}
