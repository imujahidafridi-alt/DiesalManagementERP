import { useAppStore, useUiStore } from '@/store'
import { Database, User, Search } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function Topbar() {
  const { currentOperator, dbConnected } = useAppStore()
  const { setSearchOpen } = useUiStore()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formattedDate = time.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 select-none shrink-0 shadow-sm sticky top-0 z-30">
      {/* Search / Live Date-Time */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-bold font-sans text-gray-500">
          <span>{formattedDate}</span>
          <span className="text-gray-300">•</span>
          <span>{formattedTime}</span>
        </div>
      </div>

      {/* Global Search & System Status */}
      <div className="flex items-center gap-4">
        {/* Quick Search Trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-4 py-1.5 bg-gray-100/50 hover:bg-blue-50/50 border border-gray-200 hover:border-blue-200 hover:text-blue-600 rounded-full text-[11px] text-gray-500 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
          title="Search anything (Ctrl+F)"
        >
          <Search size={12} className="text-gray-400" />
          <span className="font-semibold">Quick Lookup</span>
          <kbd className="bg-white border px-1.5 py-0.5 rounded-full ml-1 font-mono text-[9px] text-gray-400 shadow-sm">Ctrl+F</kbd>
        </button>

        {/* DB Connection */}
        <div className="flex items-center gap-2 text-xs border-l pl-4 border-gray-200/60">
          <Database size={14} className={dbConnected ? 'text-emerald-500 animate-pulse' : 'text-rose-500'} />
          <span className="text-gray-500 font-bold font-mono">
            {dbConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Operator Badge */}
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-100/60 px-3.5 py-1.5 border border-gray-200/60 rounded-full font-bold select-none shadow-sm">
          <User size={12} className="text-gray-400" />
          <span>{currentOperator || 'No Operator'}</span>
        </div>
      </div>
    </header>
  )
}
