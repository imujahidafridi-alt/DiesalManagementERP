import React from 'react'
import { AlertTriangle, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { StockConflict } from '@/database/services/TransactionService'

interface InventoryConflictDialogProps {
  isOpen: boolean
  conflicts: StockConflict[]
  onClose: () => void
  onValidateAgain?: () => void
}

function ConflictCard({ conflict, index, total }: { conflict: StockConflict; index: number; total: number }) {
  const [expanded, setExpanded] = React.useState(true)

  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden mb-3 last:mb-0">
      <div
        className="flex items-center justify-between px-3 py-2 bg-amber-50 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-semibold text-amber-800">
          Conflict {index + 1} of {total}
          {conflict.driverName ? ` — ${conflict.driverName}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-red-600 font-bold">
            {conflict.shortage.toFixed(0)} L short
          </span>
          {expanded ? <ChevronUp size={13} className="text-amber-600" /> : <ChevronDown size={13} className="text-amber-600" />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2.5 bg-white space-y-3 text-xs text-gray-700">
          <p className="text-gray-800 leading-relaxed">{conflict.description}</p>

          {conflict.affectedTransactions.length > 0 && (
            <div>
              <p className="text-gray-500 font-medium mb-1.5">All affected transactions:</p>
              <div className="rounded border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-2.5 py-1.5 font-semibold text-gray-500">Tx Number</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold text-gray-500">Type</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold text-gray-500">Date</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold text-gray-500">Qty</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold text-gray-500">Balance After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflict.affectedTransactions.map((tx, i) => (
                      <tr key={tx.txId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-2.5 py-1.5 font-mono text-gray-700">{tx.txNumber}</td>
                        <td className="px-2.5 py-1.5 text-gray-500">{tx.txType}</td>
                        <td className="px-2.5 py-1.5 text-gray-500">{tx.txDate}</td>
                        <td className="px-2.5 py-1.5 text-right">{tx.quantity}</td>
                        <td className={`px-2.5 py-1.5 text-right font-mono font-semibold ${tx.stockAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {tx.stockAfter.toFixed(0)} L
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {conflict.suggestedFixes.length > 0 && (
            <div>
              <p className="text-gray-500 font-medium mb-1">Possible fixes:</p>
              <ul className="space-y-0.5">
                {conflict.suggestedFixes.map((fix, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-gray-600">
                    <span className="text-green-500 mt-0.5 shrink-0">&#10003;</span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function InventoryConflictDialog({
  isOpen,
  conflicts,
  onClose,
  onValidateAgain,
}: InventoryConflictDialogProps) {
  React.useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white border border-gray-200 shadow-2xl rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-red-50/60 shrink-0">
          <div className="p-1.5 bg-red-100 rounded-lg">
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Inventory Conflict — Cannot Save
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} found that cannot be resolved by recalculation
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:bg-red-100 hover:text-gray-600 transition-colors" title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-gray-600 mb-3 leading-relaxed">
            This change creates an inventory shortage that cannot be automatically resolved.
            Review the conflicts below, correct the underlying data, then click Validate Again.
          </p>
          {conflicts.map((c, i) => (
            <ConflictCard key={c.driverLocationId + String(i)} conflict={c} index={i} total={conflicts.length} />
          ))}
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            To proceed: resolve the stock shortages shown above (e.g., delete or reduce the affected
            later transactions, or add a new purchase before the conflict date), then click Validate Again.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {onValidateAgain && (
            <button
              onClick={onValidateAgain}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              <RefreshCw size={12} />
              Validate Again
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
