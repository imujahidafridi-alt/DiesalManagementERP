import React, { useState, useEffect } from 'react'
import {
  AlertTriangle,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Wrench,
  ArrowRight,
  Sliders,
  Layers,
  TrendingDown,
  Sparkles,
} from 'lucide-react'
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

function SingleConflictView({
  conflict,
  conflictIndex,
  totalConflicts,
  onPrevConflict,
  onNextConflict,
}: {
  conflict: StockConflict
  conflictIndex: number
  totalConflicts: number
  onPrevConflict?: () => void
  onNextConflict?: () => void
}) {
  const [techDetailsExpanded, setTechDetailsExpanded] = useState(false)
  const [fixPreviewQty, setFixPreviewQty] = useState<number>(Math.ceil(Math.abs(conflict.shortage)))
  const [showPreviewFix, setShowPreviewFix] = useState(false)

  const navigate = useNavigate()
  const { setActiveLookupId } = useUiStore()

  // Reset fix preview quantity when conflict changes
  useEffect(() => {
    setFixPreviewQty(Math.ceil(Math.abs(conflict.shortage)))
    setShowPreviewFix(false)
  }, [conflict])

  const handleGoToTransaction = (txId: string, txType: string) => {
    setActiveLookupId(txId)
    if (txType === 'PURCHASE') {
      navigate('/purchases')
    } else if (txType === 'SALE') {
      navigate('/sales')
    } else if (txType === 'TRANSFER') {
      navigate('/transfers')
    } else if (txType === 'ADJUSTMENT' || txType === 'RETURN' || txType === 'OPENING_BALANCE') {
      navigate('/inventory')
    }
  }

  const isWacChanged = conflict.wacBefore !== conflict.wacAfter
  const isEditableType = (type: string) => ['PURCHASE', 'SALE', 'TRANSFER'].includes(type)
  const unit = FormattingService.getVolumeUnit()

  const firstNegativeTx = conflict.affectedTransactions.find((t) => t.isFirstNegative)
  const recoveryTx = conflict.affectedTransactions.find(
    (t, idx) => idx > 0 && t.stockAfter >= 0 && conflict.affectedTransactions[idx - 1]?.stockAfter < 0
  )
  const lastAffectedTx = conflict.affectedTransactions[conflict.affectedTransactions.length - 1]

  // Calculated Preview After Fix
  const projectedShortagePeak = conflict.shortage + fixPreviewQty
  const isFixSuccessful = projectedShortagePeak >= 0

  return (
    <div className="space-y-5">
      {/* ─── 1. REPAIR WIZARD SUMMARY CARD ─── */}
      {/* ─── 1. REPAIR WIZARD SUMMARY CARD (LIGHT THEME) ─── */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg border border-amber-200">
              <Wrench size={16} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block">
                Repair Summary • Location: {conflict.driverName || `ID ${conflict.driverLocationId}`}
              </span>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>Conflict in Voucher #{conflict.editedTxNumber}</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                  {conflict.editedTxType}
                </span>
              </h3>
            </div>
          </div>

          {totalConflicts > 1 && (
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
              <button
                onClick={onPrevConflict}
                className="p-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                title="Previous conflict location (Left Arrow)"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-700 px-2">
                {conflictIndex + 1} of {totalConflicts} Locations
              </span>
              <button
                onClick={onNextConflict}
                className="p-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                title="Next conflict location (Right Arrow)"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-[9.5px] uppercase font-bold text-slate-500 block mb-0.5">Required Deficit Stock</span>
            <span className="text-sm font-black text-red-600 font-mono">
              {FormattingService.formatVolume(Math.abs(conflict.shortage))}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-[9.5px] uppercase font-bold text-slate-500 block mb-0.5">First Conflict Point</span>
            <span className="text-xs font-bold text-amber-800 truncate block">
              {firstNegativeTx ? `${firstNegativeTx.txNumber} (${firstNegativeTx.txDate})` : 'N/A'}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-[9.5px] uppercase font-bold text-slate-500 block mb-0.5">Affected Transaction Chain</span>
            <span className="text-sm font-black text-slate-900 font-mono">
              {conflict.affectedTransactions.length} Entries
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-[9.5px] uppercase font-bold text-slate-500 block mb-0.5">Stock Recovery Status</span>
            <span className={`text-xs font-bold ${recoveryTx ? 'text-emerald-700' : 'text-amber-800'}`}>
              {recoveryTx ? `Recovered on ${recoveryTx.txDate}` : 'Unresolved Deficit'}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 2. STOCK FLOW PREVIEW ─── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <TrendingDown size={12} className="text-gray-400" />
            <span>Stock Flow Impact Preview</span>
          </span>
          <span className="text-[10px] text-gray-400 font-medium">Timeline simulation results</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 bg-gray-50/80 p-3 rounded-xl border border-gray-200/80">
          <div className="bg-white p-3 rounded-lg border border-gray-200/80 shadow-2xs">
            <span className="text-[9px] font-bold uppercase text-gray-400 block mb-0.5">1. Stock Before Edit</span>
            <span className="text-sm font-black text-slate-800 font-mono">
              {FormattingService.formatQuantity(conflict.stockBefore)}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-2xs">
            <span className="text-[9px] font-bold uppercase text-blue-600 block mb-0.5">2. Immediately After Edit</span>
            <span className="text-sm font-black text-blue-700 font-mono">
              {FormattingService.formatQuantity(conflict.stockAfter)}
            </span>
          </div>

          <div className="bg-red-50/80 p-3 rounded-lg border border-red-200 shadow-2xs">
            <span className="text-[9px] font-bold uppercase text-red-600 block mb-0.5">3. Peak Shortage (Lowest)</span>
            <span className="text-sm font-black text-red-600 font-mono">
              {FormattingService.formatVolume(conflict.shortage, 1)}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-gray-200/80 shadow-2xs">
            <span className="text-[9px] font-bold uppercase text-slate-500 block mb-0.5">4. End Chain Stock</span>
            <span
              className={`text-sm font-black font-mono ${
                (lastAffectedTx?.stockAfter ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {FormattingService.formatVolume(lastAffectedTx?.stockAfter ?? 0, 1)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 3. COMPACT VISUAL STEP TIMELINE (LIGHT THEME NODES) ─── */}
      {conflict.affectedTransactions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Layers size={12} className="text-gray-400" />
              <span>Interactive Step-by-Step Inventory Chain</span>
            </span>
            <span className="text-[10px] text-blue-600 font-medium">Click any node to edit entry directly</span>
          </div>

          <div className="bg-slate-100/70 p-4 rounded-xl border border-slate-200/80 overflow-x-auto shadow-inner">
            <div className="flex items-center min-w-max gap-2">
              {conflict.affectedTransactions.map((tx, idx) => {
                let badgeBg = 'bg-white border-slate-200 text-slate-800 hover:border-blue-400 shadow-2xs'
                let dotBg = 'bg-slate-400'
                let labelText = `${tx.stockAfter.toFixed(0)} ${unit}`
                let stockTextClass = tx.stockAfter < 0 ? 'text-red-600' : 'text-emerald-700'

                if (tx.isEditedTx) {
                  badgeBg = 'bg-blue-50/90 border-blue-500 text-blue-950 hover:bg-blue-100/80 ring-2 ring-blue-500/20 shadow-2xs'
                  dotBg = 'bg-blue-600'
                } else if (tx.isFirstNegative) {
                  badgeBg = 'bg-red-50/90 border-red-500 text-red-950 hover:bg-red-100/80 ring-2 ring-red-500/30 shadow-2xs'
                  dotBg = 'bg-red-600 animate-ping'
                } else if (tx.stockAfter < 0) {
                  badgeBg = 'bg-amber-50/90 border-amber-400 text-amber-950 hover:bg-amber-100/80 shadow-2xs'
                  dotBg = 'bg-amber-500'
                } else if (idx > 0 && conflict.affectedTransactions[idx - 1]?.stockAfter < 0) {
                  badgeBg = 'bg-emerald-50/90 border-emerald-500 text-emerald-950 hover:bg-emerald-100/80 shadow-2xs'
                  dotBg = 'bg-emerald-600'
                }

                return (
                  <React.Fragment key={tx.txId + idx}>
                    {idx > 0 && <ArrowRight size={14} className="text-slate-400 shrink-0" />}

                    <div
                      onClick={() => isEditableType(tx.txType) && handleGoToTransaction(tx.txId, tx.txType)}
                      className={`group relative flex flex-col p-2.5 rounded-lg border transition-all cursor-pointer select-none min-w-[130px] ${badgeBg}`}
                      title={`Click to open ${tx.txNumber} in edit mode`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-mono font-bold truncate">{tx.txNumber}</span>
                        <span className={`h-2 w-2 rounded-full ${dotBg}`} />
                      </div>

                      <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono mb-1">
                        <span>{tx.txType}</span>
                        <span>{tx.txDate.slice(5)}</span>
                      </div>

                      <div className="mt-1 pt-1 border-t border-slate-200/80 flex items-center justify-between text-[10px]">
                        <span className="text-[9px] text-slate-500 font-medium">Stock:</span>
                        <span className={`font-mono font-bold ${stockTextClass}`}>
                          {labelText}
                        </span>
                      </div>

                      {tx.isEditedTx && (
                        <span className="mt-1 text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded text-center uppercase font-bold tracking-wider">
                          Edited Entry
                        </span>
                      )}
                      {tx.isFirstNegative && (
                        <span className="mt-1 text-[8px] bg-red-600 text-white px-1.5 py-0.5 rounded text-center uppercase font-bold tracking-wider animate-pulse">
                          First Shortage ✗
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. INTERACTIVE "PREVIEW AFTER FIX" MODE ─── */}
      <div className="border border-indigo-200/90 bg-gradient-to-r from-indigo-50/60 via-white to-indigo-50/40 rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
              <Sparkles size={16} />
            </div>
            <div>
              <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                Preview Fix Simulation
              </h4>
              <p className="text-[10.5px] text-indigo-700/80 font-medium">
                Test a correction amount to check if it resolves all negative stock levels before saving.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPreviewFix((v) => !v)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg shadow-2xs transition-colors flex items-center gap-1"
          >
            <Sliders size={12} />
            <span>{showPreviewFix ? 'Hide Simulation' : 'Simulate Fix'}</span>
          </button>
        </div>

        {showPreviewFix && (
          <div className="mt-3 pt-3 border-t border-indigo-150/80 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                <span>Proposed Adjustment Stock (+):</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={fixPreviewQty}
                  onChange={(e) => setFixPreviewQty(Math.max(0, Number(e.target.value)))}
                  className="w-28 px-3 py-1.5 text-xs font-mono font-extrabold border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900"
                />
                <span className="text-xs font-bold text-gray-500">{unit}</span>
              </div>

              {/* Preset buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFixPreviewQty(Math.ceil(Math.abs(conflict.shortage)))}
                  className="text-[10px] font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-1 rounded transition-colors"
                >
                  Exact Deficit ({Math.ceil(Math.abs(conflict.shortage))} {unit})
                </button>
                <button
                  onClick={() => setFixPreviewQty(Math.ceil(Math.abs(conflict.shortage)) + 50)}
                  className="text-[10px] font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-1 rounded transition-colors"
                >
                  +50 Buffer
                </button>
              </div>
            </div>

            {/* Simulation Outcome Banner */}
            <div
              className={`p-3 rounded-lg border flex items-center gap-3 transition-all ${
                isFixSuccessful
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {isFixSuccessful ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              )}
              <div className="text-xs leading-relaxed flex-1">
                {isFixSuccessful ? (
                  <span>
                    <strong className="font-extrabold text-emerald-700">✓ Conflict 100% Resolved!</strong> With a{' '}
                    <strong>+{fixPreviewQty} {unit}</strong> correction, stock levels will remain positive throughout the timeline (New lowest stock:{' '}
                    <strong>{projectedShortagePeak.toFixed(1)} {unit}</strong>).
                  </span>
                ) : (
                  <span>
                    <strong className="font-extrabold text-amber-800">Remaining Deficit:</strong> Adding +{fixPreviewQty} {unit} leaves a remaining shortage of{' '}
                    <strong>{Math.abs(projectedShortagePeak).toFixed(1)} {unit}</strong>. Add at least{' '}
                    <strong>{Math.ceil(Math.abs(conflict.shortage))} {unit}</strong> to resolve completely.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── 5. CHRONOLOGICAL TABLE TIMELINE WITH DIRECT ACTIONS ─── */}
      {conflict.affectedTransactions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">
              Chronological Transaction Timeline ({conflict.affectedTransactions.length} entries):
            </p>
            <span className="text-[10px] text-gray-400 font-medium">Use action buttons to fix entries directly</span>
          </div>

          <div className="rounded-xl border border-gray-200/80 overflow-hidden shadow-2xs">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200/80 text-gray-700 font-bold">
                  <th className="text-left px-3 py-2 font-semibold">Voucher No</th>
                  <th className="text-left px-3 py-2 font-semibold">Type</th>
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  <th className="text-right px-3 py-2 font-semibold">Qty</th>
                  <th className="text-right px-3 py-2 font-semibold">Running Stock</th>
                  <th className="text-center px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {conflict.affectedTransactions.map((tx, idx) => {
                  let rowClass = 'bg-white hover:bg-gray-50/50'
                  let marker = null

                  if (tx.isFirstNegative) {
                    rowClass = 'bg-red-50/70 hover:bg-red-50/90 border-l-4 border-red-500 font-semibold'
                    marker = (
                      <span className="inline-block text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wide">
                        First Shortage ✗
                      </span>
                    )
                  } else if (tx.isEditedTx) {
                    rowClass = 'bg-blue-50/50 hover:bg-blue-50/70 border-l-4 border-blue-500'
                    marker = (
                      <span className="inline-block text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wide">
                        Edited Entry
                      </span>
                    )
                  } else if (tx.stockAfter < 0) {
                    rowClass = 'bg-amber-50/40 hover:bg-amber-50/60'
                  } else if (idx > 0 && conflict.affectedTransactions[idx - 1]?.stockAfter < 0) {
                    rowClass = 'bg-emerald-50/30 hover:bg-emerald-50/50 border-l-4 border-emerald-500'
                    marker = (
                      <span className="inline-block text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wide">
                        Stock Recovered ✓
                      </span>
                    )
                  }

                  return (
                    <tr key={tx.txId + idx} className={rowClass}>
                      <td className="px-3 py-2 font-mono text-gray-900 font-bold">
                        <div className="flex flex-col gap-0.5">
                          <span>{tx.txNumber}</span>
                          {marker}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600 uppercase font-semibold text-[10px]">{tx.txType}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">{tx.txDate}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {FormattingService.formatQuantityWithoutUnit(tx.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`font-mono font-extrabold px-2 py-0.5 rounded-full text-[10px] ${
                            tx.stockAfter < 0
                              ? 'bg-red-100 border border-red-200 text-red-700'
                              : 'bg-emerald-100 border border-emerald-200 text-emerald-800'
                          }`}
                        >
                          {FormattingService.formatVolume(tx.stockAfter, 0)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center select-none">
                        {isEditableType(tx.txType) ? (
                          <button
                            onClick={() => handleGoToTransaction(tx.txId, tx.txType)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition-colors shadow-2xs"
                          >
                            <ExternalLink size={10} />
                            <span>Open Transaction</span>
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

      {/* ─── 6. ACTIONABLE REPAIR SUGGESTIONS LIST ─── */}
      {conflict.suggestedFixes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">
            Intelligent Actionable Repair Recommendations:
          </p>
          <ul className="space-y-2 bg-emerald-50/40 border border-emerald-200/80 p-3.5 rounded-xl">
            {conflict.suggestedFixes.map((fix, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-800 leading-relaxed text-xs">
                <span className="text-emerald-600 font-black mt-0.5 shrink-0">✓</span>
                <span>{fix}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── 7. EXPANDABLE TECHNICAL DETAILS ACCORDION ─── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden select-none shadow-2xs">
        <div
          className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 cursor-pointer text-[10px] font-bold text-gray-600 uppercase tracking-wider transition-colors"
          onClick={() => setTechDetailsExpanded((v) => !v)}
        >
          <div className="flex items-center gap-1.5">
            <HelpCircle size={13} className="text-gray-400" />
            <span>Technical Ledger Specifications & WAC Check</span>
          </div>
          {techDetailsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
        {techDetailsExpanded && (
          <div className="p-3.5 bg-white border-t border-gray-200 space-y-2 text-[11px] text-gray-600 font-mono">
            <div className="flex justify-between border-b border-gray-100 pb-1.5">
              <span>Inventory Before Edit:</span>
              <span className="font-extrabold text-slate-800">{FormattingService.formatVolume(conflict.stockBefore, 2)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-1.5">
              <span>Inventory Immediately After Edit:</span>
              <span className="font-extrabold text-red-600">{FormattingService.formatVolume(conflict.stockAfter, 2)}</span>
            </div>
            {isWacChanged ? (
              <>
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span>WAC Before Edit:</span>
                  <span className="font-extrabold text-slate-800">{FormattingService.formatRate(conflict.wacBefore)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-1.5">
                  <span>WAC After Edit:</span>
                  <span className="font-extrabold text-indigo-700">{FormattingService.formatRate(conflict.wacAfter)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between border-b border-gray-100 pb-1.5">
                <span>WAC Snapshot (Unchanged):</span>
                <span className="font-extrabold text-slate-800">{FormattingService.formatRate(conflict.wacBefore)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Cumulative Volume Peak Check:</span>
              <span className="font-extrabold text-slate-800">
                Shortage Deficit: {FormattingService.formatVolume(Math.abs(conflict.shortage), 2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function InventoryConflictDialog({
  isOpen,
  conflicts,
  onClose,
  onValidateAgain,
}: InventoryConflictDialogProps) {
  const [activeConflictIndex, setActiveConflictIndex] = useState(0)

  // Reset active index when conflicts change
  useEffect(() => {
    setActiveConflictIndex(0)
  }, [conflicts])

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') {
        setActiveConflictIndex((prev) => (prev > 0 ? prev - 1 : conflicts.length - 1))
      }
      if (e.key === 'ArrowRight') {
        setActiveConflictIndex((prev) => (prev < conflicts.length - 1 ? prev + 1 : 0))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, conflicts, onClose])

  if (!isOpen || conflicts.length === 0) return null

  const activeConflict = conflicts[activeConflictIndex] || conflicts[0]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 animate-in fade-in duration-200" onClick={onClose} />

      {/* Dialog Frame */}
      <div className="relative bg-white border border-gray-200 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-red-100 bg-red-50/60 shrink-0 select-none">
          <div className="p-2 bg-red-100 text-red-600 rounded-xl shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-black text-red-950 uppercase tracking-wider flex items-center gap-2">
              <span>INVENTORY CONFLICT REPAIR WIZARD</span>
              <span className="px-2 py-0.5 text-[9.5px] font-extrabold bg-red-200/80 text-red-800 rounded-full">
                {conflicts.length} Location{conflicts.length !== 1 ? 's' : ''} Blocked
              </span>
            </h2>
            <p className="text-[11px] text-red-700/80 font-medium mt-0.5">
              Review chronological stock timelines, test proposed fixes, or open conflicting vouchers directly to resolve.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors focus:outline-none"
            title="Close dialog (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Location Selector Tabs (if multiple conflicts) */}
        {conflicts.length > 1 && (
          <div className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-50 border-b border-gray-200 overflow-x-auto shrink-0 select-none">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Locations:</span>
            {conflicts.map((c, idx) => (
              <button
                key={c.driverLocationId + idx}
                onClick={() => setActiveConflictIndex(idx)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  idx === activeConflictIndex
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white text-gray-700 hover:bg-gray-150 border border-gray-200'
                }`}
              >
                <span>{c.driverName || `ID ${c.driverLocationId}`}</span>
                <span className="px-1.5 py-0.2 text-[9.5px] rounded bg-black/20 text-white font-mono">
                  -{Math.abs(c.shortage).toFixed(0)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <SingleConflictView
            conflict={activeConflict}
            conflictIndex={activeConflictIndex}
            totalConflicts={conflicts.length}
            onPrevConflict={() => setActiveConflictIndex((prev) => (prev > 0 ? prev - 1 : conflicts.length - 1))}
            onNextConflict={() => setActiveConflictIndex((prev) => (prev < conflicts.length - 1 ? prev + 1 : 0))}
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50/80 shrink-0 select-none">
          <div className="text-[11px] text-gray-500 font-medium">
            Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono text-[10px] text-gray-700">Esc</kbd> to exit or <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono text-[10px] text-gray-700">← / →</kbd> to switch locations
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none"
            >
              Cancel
            </button>
            {onValidateAgain && (
              <button
                onClick={onValidateAgain}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none shadow-xs"
              >
                <RefreshCw size={13} className="animate-pulse" />
                <span>Validate Again</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
