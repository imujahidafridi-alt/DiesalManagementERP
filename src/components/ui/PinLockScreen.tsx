import React, { useState, useEffect, useRef } from 'react'
import { Lock, KeyRound, ShieldAlert, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react'
import { useAppStore, useUiStore } from '@/store'

export default function PinLockScreen() {
  const { hasPin, isAppUnlocked, authUser, unlockApp, createInitialPin } = useAppStore()
  const { addToast } = useUiStore()

  // Input states
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [operatorName, setOperatorName] = useState('System Administrator')
  const [operatorEmail, setOperatorEmail] = useState('admin@sahara.local')

  // Status & Error states
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lockRemaining, setLockRemaining] = useState(0)

  const pinInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input field on mount or error
  useEffect(() => {
    if (!isAppUnlocked) {
      setTimeout(() => pinInputRef.current?.focus(), 100)
    }
  }, [isAppUnlocked, hasPin])

  // Lockout countdown timer
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

  if (isAppUnlocked) return null

  // Handle keypad digit click
  const handleKeypadClick = (digit: string) => {
    if (lockRemaining > 0) return
    if (pin.length < 8) {
      setPin((prev) => prev + digit)
    }
  }

  // Handle Backspace
  const handleBackspace = () => {
    if (lockRemaining > 0) return
    setPin((prev) => prev.slice(0, -1))
  }

  // Handle Lock Screen Unlock Submit
  const handleUnlockSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pin || lockRemaining > 0) return

    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await unlockApp(pin)
      if (res.success) {
        addToast('Application unlocked successfully', 'success')
        setPin('')
      } else {
        setErrorMsg(res.error || 'Incorrect Security PIN')
        setPin('')
        if (res.lockedOut && res.lockRemainingSeconds) {
          setLockRemaining(res.lockRemainingSeconds)
        }
      }
    } catch {
      setErrorMsg('Failed to verify security PIN')
    } finally {
      setLoading(false)
      setTimeout(() => pinInputRef.current?.focus(), 100)
    }
  }

  // Handle First-Run PIN Creation Submit
  const handleCreatePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{4,8}$/.test(pin)) {
      setErrorMsg('PIN must be between 4 and 8 digits.')
      return
    }
    if (pin !== confirmPin) {
      setErrorMsg('PIN and Confirmation PIN do not match.')
      return
    }

    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await createInitialPin(pin, {
        name: operatorName,
        email: operatorEmail,
        role: 'ADMIN',
      })

      if (res.success) {
        addToast('Admin security PIN created successfully', 'success')
        setPin('')
        setConfirmPin('')
      } else {
        setErrorMsg(res.error || 'Failed to set security PIN.')
      }
    } catch {
      setErrorMsg('Failed to save admin security PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-white border border-slate-200/90 shadow-2xl rounded-2xl p-7 flex flex-col items-center text-slate-900">
        
        {/* Lock Screen Header */}
        <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100/80 shadow-sm mb-4">
          {hasPin ? <Lock size={28} /> : <KeyRound size={28} />}
        </div>

        <h1 className="text-lg font-black tracking-wide text-slate-900 mb-1">
          {hasPin ? 'SAHARA DIESELS ERP' : 'ADMIN SECURITY SETUP'}
        </h1>
        <p className="text-xs text-slate-500 font-medium mb-6 text-center">
          {hasPin
            ? 'Enter your operator PIN to access the terminal'
            : 'Configure initial Administrator PIN for security protection'}
        </p>

        {/* ─── CASE A: UNLOCK SCREEN (HAS PIN) ─── */}
        {hasPin ? (
          <form onSubmit={handleUnlockSubmit} className="w-full space-y-5">
            {/* Operator Badge */}
            <div className="flex items-center justify-center gap-2.5 bg-slate-50 border border-slate-200/90 p-2.5 rounded-xl">
              <div className="h-7 w-7 rounded-full bg-blue-100 border border-blue-200 text-blue-700 font-extrabold text-xs flex items-center justify-center">
                {(authUser?.name || 'A').charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <span className="text-[11px] font-bold text-slate-900 block leading-tight">
                  {authUser?.name || 'System Operator'}
                </span>
                <span className="text-[9.5px] text-slate-500 font-mono block">
                  {authUser?.email || 'admin@sahara.local'} • {authUser?.role || 'ADMIN'}
                </span>
              </div>
            </div>

            {/* PIN Input Display */}
            <div className="relative">
              <input
                ref={pinInputRef}
                type="password"
                maxLength={8}
                value={pin}
                disabled={lockRemaining > 0 || loading}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter PIN"
                className="w-full text-center text-2xl font-mono font-black tracking-[0.5em] bg-slate-50 border border-slate-300 focus:border-blue-600 rounded-xl py-3 text-slate-900 placeholder:text-slate-400 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner disabled:opacity-50"
              />
            </div>

            {/* Error / Lockout Banner */}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2 animate-in zoom-in-95">
                <ShieldAlert size={16} className="text-red-500 shrink-0" />
                <span className="flex-1 font-medium">{errorMsg}</span>
              </div>
            )}

            {lockRemaining > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2 animate-pulse">
                <ShieldAlert size={16} className="text-amber-600 shrink-0" />
                <span className="font-semibold">Lockout Active: Try again in {lockRemaining} seconds</span>
              </div>
            )}

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={lockRemaining > 0}
                  onClick={() => handleKeypadClick(digit)}
                  className="py-3.5 text-xl font-mono font-extrabold bg-slate-50 hover:bg-blue-50/80 active:bg-blue-100 border border-slate-200/90 rounded-xl text-slate-800 hover:text-blue-700 hover:border-blue-300 transition-all shadow-2xs disabled:opacity-40 cursor-pointer"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                disabled={lockRemaining > 0 || !pin}
                onClick={handleBackspace}
                className="py-3.5 text-xs font-bold uppercase tracking-wider bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-all shadow-2xs disabled:opacity-30 cursor-pointer"
              >
                Clear
              </button>

              <button
                type="button"
                disabled={lockRemaining > 0}
                onClick={() => handleKeypadClick('0')}
                className="py-3.5 text-xl font-mono font-extrabold bg-slate-50 hover:bg-blue-50/80 active:bg-blue-100 border border-slate-200/90 rounded-xl text-slate-800 hover:text-blue-700 hover:border-blue-300 transition-all shadow-2xs disabled:opacity-40 cursor-pointer"
              >
                0
              </button>

              <button
                type="submit"
                disabled={lockRemaining > 0 || !pin || loading}
                className="py-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center transition-all disabled:opacity-40 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                {loading ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={20} />}
              </button>
            </div>

            <p className="text-[10px] text-slate-400 font-mono text-center">
              Physical keyboard numpad supported • Press Enter to submit
            </p>
          </form>
        ) : (
          /* ─── CASE B: FIRST-RUN PIN SETUP (NO PIN) ─── */
          <form onSubmit={handleCreatePinSubmit} className="w-full space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Administrator Name
                </label>
                <input
                  type="text"
                  required
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="e.g. Haroon Wazir"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Administrator Email
                </label>
                <input
                  type="email"
                  required
                  value={operatorEmail}
                  onChange={(e) => setOperatorEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  New Admin Security PIN (4–8 digits)
                </label>
                <input
                  ref={pinInputRef}
                  type="password"
                  maxLength={8}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 4-8 digit PIN"
                  className="w-full text-center font-mono font-extrabold tracking-widest text-lg bg-slate-50 border border-slate-300 rounded-xl py-2.5 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Confirm Admin Security PIN
                </label>
                <input
                  type="password"
                  maxLength={8}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Re-enter PIN"
                  className="w-full text-center font-mono font-extrabold tracking-widest text-lg bg-slate-50 border border-slate-300 rounded-xl py-2.5 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                <ShieldAlert size={16} className="text-red-500 shrink-0" />
                <span className="flex-1 font-medium">{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !pin || pin !== confirmPin}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-md shadow-blue-600/20 mt-2 cursor-pointer"
            >
              {loading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Create Admin Security PIN & Start</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
