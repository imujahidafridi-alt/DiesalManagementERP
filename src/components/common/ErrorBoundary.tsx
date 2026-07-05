import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertOctagon, RefreshCw, Download } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    
    // Log exception to file using Logger
    if (typeof window !== 'undefined' && (window as any).api) {
      (window as any).api.invoke('logger:write', {
        level: 'critical',
        message: `React Unhandled Rendering Exception: ${error.message}`,
        errorStack: errorInfo.componentStack,
      }).catch(console.error)
    }
  }

  private handleRestart = () => {
    if (typeof window !== 'undefined' && (window as any).api) {
      (window as any).api.invoke('app:reboot').catch(() => {
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }

  private handleExportDiagnostics = async () => {
    if (typeof window !== 'undefined' && (window as any).api) {
      try {
        const data = await (window as any).api.invoke('app:exportDiagnostics')
        const blob = new Blob([data], { type: 'text/plain;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `malak_erp_diagnostics_${new Date().toISOString().split('T')[0]}.txt`)
        link.click()
      } catch (e: any) {
        alert(`Failed to export logs: ${e.message}`)
      }
    } else {
      alert('Diagnostic extraction not available offline.')
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 select-none font-sans">
          <div className="max-w-md w-full bg-white border border-red-200 rounded-lg shadow-2xl p-6 space-y-5">
            {/* Header Icon */}
            <div className="flex gap-4 items-start border-b border-red-100 pb-4">
              <div className="p-2 bg-red-50 text-red-600 border border-red-100 rounded-full shrink-0">
                <AlertOctagon size={24} />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider">System Recovery Console</h2>
                <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                  An unhandled rendering exception crashed the UI loop. Your ledger database transaction states remain protected.
                </p>
              </div>
            </div>

            {/* Error Message Details */}
            <div className="bg-gray-50 border p-3.5 rounded space-y-1.5 max-h-40 overflow-y-auto font-mono text-[10px] text-gray-600">
              <div className="font-bold text-red-700">Exception: {this.state.error?.message}</div>
              {this.state.errorInfo && (
                <pre className="whitespace-pre-wrap leading-normal">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <button
                onClick={this.handleRestart}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold cursor-pointer transition-colors shadow-sm"
              >
                <RefreshCw size={13} />
                <span>Restart ERP App</span>
              </button>

              <button
                onClick={this.handleExportDiagnostics}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 border rounded font-semibold text-gray-700 cursor-pointer transition-colors"
              >
                <Download size={13} />
                <span>Export Diagnostics</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
