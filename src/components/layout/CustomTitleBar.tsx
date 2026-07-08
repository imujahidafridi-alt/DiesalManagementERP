import { Sun, Database, User, Search } from 'lucide-react'
import { useAppStore, useUiStore } from '@/store'
import { useState, useEffect } from 'react'

export default function CustomTitleBar() {
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
    hour12: true,
  })

  const handleMinimize = () => {
    window.api.invoke('window:minimize')
  }

  const handleMaximize = () => {
    window.api.invoke('window:maximize')
  }

  const handleClose = () => {
    window.api.invoke('window:close')
  }

  return (
    <div
      className="h-10 text-slate-300 flex items-center justify-between pl-4 pr-0 select-none border-b border-slate-800 shrink-0 shadow-sm sidebar-gradient"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: Branding & Date-Time */}
      <div className="flex items-center gap-3.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="flex items-center gap-1.5">
          <Sun size={12} className="text-amber-400 animate-pulse" />
          <span className="text-[10px] font-extrabold text-white tracking-wider uppercase">Sahara Diesels</span>
        </div>
        <span className="text-slate-700 select-none">•</span>
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400">
          <span>{formattedDate}</span>
          <span className="text-slate-700">•</span>
          <span>{formattedTime}</span>
        </div>
      </div>

      {/* Right: Search, Status, Operator, Window Controls */}
      <div className="flex items-center gap-3.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Quick Search Trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 hover:text-white rounded-full text-[9px] text-slate-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
          title="Search anything (Ctrl+F)"
        >
          <Search size={10} className="text-slate-400" />
          <span className="font-semibold">Quick Lookup</span>
          <kbd className="bg-slate-900 border border-slate-700 px-1.5 py-0.2 rounded-full ml-1 font-mono text-[7px] text-slate-400 shadow-sm">Ctrl+F</kbd>
        </button>

        {/* DB Connection */}
        <div className="flex items-center gap-1.5 text-[10px] border-l pl-3.5 border-slate-800">
          <Database size={12} className={dbConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-500'} />
          <span className="text-slate-450 font-bold font-mono">
            {dbConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Operator Badge */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-200 bg-slate-800/50 px-3 py-1 border border-slate-700/50 rounded-full font-bold select-none shadow-sm">
          <User size={10} className="text-slate-400" />
          <span>{currentOperator || 'Haroon Wazir'}</span>
        </div>

        {/* Window Controls */}
        <div className="flex items-center border-l border-slate-800 h-10">
          <button
            onClick={handleMinimize}
            className="h-10 w-11 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors focus:outline-none"
            title="Minimize"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" shapeRendering="crispEdges">
              <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={handleMaximize}
            className="h-10 w-11 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors focus:outline-none"
            title="Maximize"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" shapeRendering="crispEdges">
              <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={handleClose}
            className="h-10 w-11 flex items-center justify-center hover:bg-red-650 hover:text-white transition-colors focus:outline-none"
            title="Close"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
