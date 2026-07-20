import React, { useState, useEffect, useRef } from 'react'
import { Lock, ShieldAlert, X, RefreshCw, Check } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store'

export interface PinConfirmModalProps {
  isOpen: boolean
  title?: string
  description?: string
  actionName?: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export default function PinConfirmModal({
  isOpen,
  title = 'Security PIN Required',
  description = 'Please enter your Security PIN to authorize this sensitive action.',
  actionName = 'SENSITIVE_ACTION',
  onConfirm,
  onClose,
}: PinConfirmModalProps) {
  const { verifyPinForAction } = useAppStore()

  const [pin, setPin] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lockRemaining, setLockRemaining] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)

  // Auto focus & reset state on open
  useEffect(() => {
    if (isOpen) {
      setPin('')
      setErrorMsg(null)
      setLockRemaining(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Countdown timer for lockout
  useEffect(() => {
    if (lockRemaining <= 0) return
    const timer = setInterval(() => {
      setLockRemaining((prev) => {
        if (prev <= 1) {
          setErrorMsg(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [lockRemaining])

  // Keyboard shortcut Esc
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pin || lockRemaining > 0 || loading) return

    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await verifyPinForAction(pin, actionName)
      if (res.success) {
        onClose()
        await onConfirm()
      } else {
        setErrorMsg(res.error || 'Incorrect Security PIN')
        setPin('')
        if (res.lockedOut && res.lockRemainingSeconds) {
          setLockRemaining(res.lockRemainingSeconds)
        }
      }
    } catch {
      setErrorMsg('Failed to verify PIN')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9950] flex items-center justify-center p-4 select-none">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 animate-in fade-in duration-200" onClick={onClose} />

      {/* Modal Frame */}
      <div className="relative bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-md p-6 text-white animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl">
              <Lock size={18} />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">{title}</h3>
              <span className="text-[10px] font-mono text-slate-400">Action: {actionName}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">{description}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              maxLength={8}
              value={pin}
              disabled={lockRemaining > 0 || loading}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter Security PIN"
              className="w-full text-center text-xl font-mono font-extrabold tracking-[0.4em] bg-slate-950 border border-slate-750 focus:border-blue-500 rounded-xl py-2.5 text-white placeholder:text-slate-600 placeholder:text-xs placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all disabled:opacity-50"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs flex items-center gap-2">
              <ShieldAlert size={15} className="text-red-400 shrink-0" />
              <span className="flex-1 leading-snug">{errorMsg}</span>
            </div>
          )}

          {lockRemaining > 0 && (
            <div className="p-2.5 bg-amber-950/80 border border-amber-800 text-amber-200 rounded-xl text-xs flex items-center gap-2 animate-pulse">
              <ShieldAlert size={15} className="text-amber-400 shrink-0" />
              <span>Lockout Active: Wait {lockRemaining} seconds</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!pin || lockRemaining > 0 || loading}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-40 shadow-md shadow-blue-600/20"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <>
                  <Check size={14} />
                  <span>Authorize & Continue</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
