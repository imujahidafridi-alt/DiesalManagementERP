import { Minimize2, Maximize2, X, Sun } from 'lucide-react'

export default function CustomTitleBar() {
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
      className="h-9 bg-slate-900 text-slate-300 flex items-center justify-between px-3 select-none border-b border-slate-800 shrink-0"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Left: Branding */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <Sun size={14} className="text-amber-500 animate-pulse" />
        <span className="text-xs font-bold text-slate-200 tracking-wider uppercase">Sahara Diesels</span>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={handleMinimize}
          className="h-9 w-12 flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors focus:outline-none"
          title="Minimize"
        >
          <Minimize2 size={13} />
        </button>
        <button
          onClick={handleMaximize}
          className="h-9 w-12 flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors focus:outline-none"
          title="Maximize"
        >
          <Maximize2 size={13} />
        </button>
        <button
          onClick={handleClose}
          className="h-9 w-12 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors focus:outline-none"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
