import React from 'react'
import { AlertTriangle, X, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Info, HelpCircle } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '@/store'
import type { StockConflict } from '@/database/services/TransactionService'
import { FormattingService } from '@/utils/FormattingService'

interface InventoryConflictDialogProps {
  isOpen: boolean
  conflicts: StockConflict[]
  onClose: () => void
  onValidateAgain?: () => void
}

function ConflictCard({ conflict, index }: { conflict: StockConflict; index: number }) {
  const [expanded, setExpanded] = React.useState(true)
  const [techDetailsExpanded, setTechDetailsExpanded] = React.useState(false)
  const navigate = useNavigate()
  const { setActiveLookupId } = useUiStore()

  const handleGoToTransaction = (txId: string, txType: string) => {
    setActiveLookupId(txId)
    if (txType === 'PURCHASE') {
      navigate('/purchases')
    } else if (txType === 'SALE') {
      navigate('/sales')
    } else if (txType === 'TRANSFER') {
      navigate('/transfers')
    }
  }

  const isWacChanged = conflict.wacBefore !== conflict.wacAfter
  const isEditableType = (type: string) => ['PURCHASE', 'SALE', 'TRANSFER'].includes(type)

  return (
    <div className="border border-red-200/80 rounded-xl overflow-hidden mb-4 last:mb-0 shadow-sm transition-all duration-200">
      {/* Card Header Accordion Trigger */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-red-50/50 hover:bg-red-50/80 cursor-pointer select-none border-b border-red-150 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
            {index + 1}
          </span>
          <span className="text-xs font-bold text-red-900">
            {conflict.driverName ? `${conflict.driverName}` : `Location ${conflict.driverLocationId}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-red-150 text-[10px] font-extrabold text-red-700 uppercase tracking-wide">
            {FormattingService.formatQuantity(Math.abs(conflict.shortage))} Shortage
          </span>
          {expanded ? <ChevronUp size={14} className="text-red-500" /> : <ChevronDown size={14} className="text-red-500" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 bg-white space-y-4 text-xs">
          {/* Plain Language Explanation */}
          <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 text-gray-700 leading-relaxed">
            <Info size={14} className="text-slate-500 mt-0.5 shrink-0" />
            <p>{conflict.description}</p>
          </div>

          {/* Current vs Projected Stock widget */}
          <div className="grid grid-cols-3 gap-3 items-center bg-gray-50/60 p-3 rounded-lg border border-gray-100">
            <div className="text-center bg-white p-2.5 rounded border border-gray-200/60">
              <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Stock Before Edit</span>
              <span className="text-sm font-black text-slate-800">
                {FormattingService.formatQuantity(conflict.stockBefore)}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-[9px] uppercase font-bold text-red-500 mb-0.5">Shortage</span>
              <span className="text-xs font-mono font-extrabold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                {conflict.shortage.toFixed(1)} L
              </span>
            </div>
            <div className="text-center bg-white p-2.5 rounded border border-red-200">
              <span className="text-[9px] uppercase font-bold text-red-500 block mb-0.5">Projected Stock</span>
              <span className="text-sm font-black text-red-600">
                {FormattingService.formatQuantity(conflict.stockAfter)}
              </span>
            </div>
          </div>

          {/* Chronological Timeline */}
          {conflict.affectedTransactions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Affected Transactions Timeline:</p>
              <div className="rounded-lg border border-gray-200/60 overflow-hidden shadow-sm">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-150 border-b border-gray-200/60 text-gray-600 font-bold">
                      <th className="text-left px-3 py-2 font-semibold">Voucher No</th>
                      <th className="text-left px-3 py-2 font-semibold">Type</th>
                      <th className="text-left px-3 py-2 font-semibold">Date</th>
                      <th className="text-right px-3 py-2 font-semibold">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold">Stock After</th>
                      <th className="text-center px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {conflict.affectedTransactions.map((tx) => {
                      let rowClass = 'bg-white hover:bg-gray-50/50'
                      let marker = null

                      if (tx.isFirstNegative) {
                        rowClass = 'bg-red-50/40 hover:bg-red-50/60 border-l-4 border-red-500'
                        marker = <span className="inline-block text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wide">First Shortage</span>
                      } else if (tx.isEditedTx) {
                        rowClass = 'bg-blue-50/30 hover:bg-blue-50/50 border-l-4 border-blue-500'
                        marker = <span className="inline-block text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wide">Edited Entry</span>
                      }

                      return (
                        <tr key={tx.txId} className={rowClass}>
                          <td className="px-3 py-2 font-mono text-gray-900 font-bold">
                            <div className="flex flex-col gap-0.5">
                              <span>{tx.txNumber}</span>
                              {marker}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-500 uppercase font-semibold text-[10px]">{tx.txType}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">{tx.txDate}</td>
                          <td className="px-3 py-2 text-right font-medium">{FormattingService.formatQuantityWithoutUnit(tx.quantity)}</td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`font-mono font-extrabold px-1.5 py-0.5 rounded-full text-[10px] ${
                                tx.stockAfter < 0
                                  ? 'bg-red-50 border border-red-200 text-red-600'
                                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                              }`}
                            >
                              {tx.stockAfter.toFixed(0)} L
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center select-none">
                            {isEditableType(tx.txType) ? (
                              <button
                                onClick={() => handleGoToTransaction(tx.txId, tx.txType)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded transition-colors"
                              >
                                <ExternalLink size={10} />
                                <span>Go to Edit</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400 font-medium">Locked Type</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dynamic Actionable suggestions */}
          {conflict.suggestedFixes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Intelligent Suggested Fixes:</p>
              <ul className="space-y-1.5 bg-emerald-50/30 border border-emerald-100 p-3 rounded-lg">
                {conflict.suggestedFixes.map((fix, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700 leading-normal">
                    <span className="text-emerald-600 font-bold mt-0.5 shrink-0">&#10003;</span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Expandable Technical Details */}
          <div className="border border-gray-150 rounded-lg overflow-hidden select-none">
            <div
              className="flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-150 cursor-pointer text-[10px] font-bold text-gray-500 uppercase tracking-wider transition-colors"
              onClick={() => setTechDetailsExpanded((v) => !v)}
            >
              <div className="flex items-center gap-1.5">
                <HelpCircle size={12} className="text-gray-400" />
                <span>Technical Specifications</span>
              </div>
              {techDetailsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </div>
            {techDetailsExpanded && (
              <div className="p-3 bg-white border-t border-gray-150 space-y-2 text-[11px] text-gray-600 font-mono">
                <div className="flex justify-between border-b border-gray-50 pb-1.5">
                  <span>Inventory Before Edit:</span>
                  <span className="font-extrabold text-slate-800">{conflict.stockBefore.toFixed(2)} L</span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-1.5">
                  <span>Inventory After Edit:</span>
                  <span className="font-extrabold text-red-600">{conflict.stockAfter.toFixed(2)} L</span>
                </div>
                {isWacChanged ? (
                  <>
                    <div className="flex justify-between border-b border-gray-50 pb-1.5">
                      <span>WAC Before Edit:</span>
                      <span className="font-extrabold text-slate-800">{FormattingService.formatRate(conflict.wacBefore)}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 pb-1.5">
                      <span>WAC After Edit:</span>
                      <span className="font-extrabold text-indigo-700">{FormattingService.formatRate(conflict.wacAfter)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between border-b border-gray-50 pb-1.5">
                    <span>WAC Snapshot (Unchanged):</span>
                    <span className="font-extrabold text-slate-800">{FormattingService.formatRate(conflict.wacBefore)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Cumulative Vol Check:</span>
                  <span className="font-extrabold text-slate-800">Shortage offset: {Math.abs(conflict.shortage).toFixed(2)} L</span>
                </div>
              </div>
            )}
          </div>
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      
      {/* Dialog Frame */}
      <div className="relative bg-white border border-gray-200/50 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-red-100 bg-red-50/50 shrink-0 select-none">
          <div className="p-1.5 bg-red-100 rounded-lg shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-black text-red-950 uppercase tracking-wider">
              INVENTORY CONFLICT — CANNOT SAVE
            </h2>
            <p className="text-[10.5px] text-red-700/80 font-medium mt-0.5">
              {conflicts.length} location{conflicts.length !== 1 ? 's' : ''} would experience negative stock levels.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors focus:outline-none"
            title="Close dialog (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed select-none">
            The changes you are applying would result in mathematically invalid negative stock levels at one or more dates.
            Review the chronological timelines below, use the <strong>Go to Edit</strong> buttons to open conflicting entries directly,
            and click <strong>Validate Again</strong> once they are resolved.
          </p>

          <div className="space-y-4">
            {conflicts.map((c, i) => (
              <ConflictCard key={c.driverLocationId + String(i)} conflict={c} index={i} />
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 px-4 py-3 border-t border-gray-100 bg-gray-50/50 shrink-0 select-none">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-700 hover:text-gray-900 bg-white border border-gray-200/80 hover:border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500/20"
          >
            Cancel
          </button>
          {onValidateAgain && (
            <button
              onClick={onValidateAgain}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/25 shadow-sm"
            >
              <RefreshCw size={12} className="animate-pulse" />
              <span>Validate Again</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
