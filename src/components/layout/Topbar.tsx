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
    <header className="h-12 border-b bg-white flex items-center justify-between px-6 select-none shrink-0">
      {/* Search / Live Date-Time */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
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
          className="flex items-center gap-2 px-3 py-1 bg-gray-50 hover:bg-gray-100 border rounded text-xs text-gray-500 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
          title="Search anything (Ctrl+F)"
        >
          <Search size={12} className="text-gray-400" />
          <span>Quick Lookup</span>
          <kbd className="bg-white border px-1 rounded ml-1 font-mono text-[10px] text-gray-400">Ctrl+F</kbd>
        </button>

        {/* DB Connection */}
        <div className="flex items-center gap-2 text-xs border-l pl-4">
          <Database size={14} className={dbConnected ? 'text-green-500' : 'text-red-500'} />
          <span className="text-gray-500 font-medium font-mono">
            {dbConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Operator Badge */}
        <div className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 px-3 py-1 border rounded font-medium">
          <User size={12} className="text-gray-400" />
          <span>{currentOperator || 'No Operator'}</span>
        </div>
      </div>
    </header>
  )
}
