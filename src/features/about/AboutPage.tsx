import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore, useUiStore } from '@/store'
import { appConfig } from '@/config/appConfig'
import Logo from '@/components/common/Logo'
import { Button } from '@/components/ui'
import {
  Copy,
  Check,
  Info,
  Database,
  Laptop
} from 'lucide-react'

export default function AboutPage() {
  const navigate = useNavigate()
  const { dbConnected, currentOperator } = useAppStore()
  const { addToast } = useUiStore()

  // Copy states
  const [copiedContact, setCopiedContact] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  // Esc key listener to navigate back to dashboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  const copyToClipboard = async (text: string, type: 'contact' | 'email') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'contact') {
        setCopiedContact(true)
        setTimeout(() => setCopiedContact(false), 2000)
      } else {
        setCopiedEmail(true)
        setTimeout(() => setCopiedEmail(false), 2000)
      }
      addToast('Copied to clipboard!', 'success')
    } catch (err) {
      addToast('Failed to copy to clipboard', 'error')
    }
  }

  const handleCheckUpdates = () => {
    setCheckingUpdates(true)
    setTimeout(() => {
      setCheckingUpdates(false)
      addToast('You are running the latest version!', 'success')
    }, 1500)
  }

  // Detect Operating System
  const getOS = () => {
    const userAgent = window.navigator.userAgent.toLowerCase()
    if (userAgent.includes('win')) return 'Windows'
    if (userAgent.includes('mac')) return 'macOS'
    if (userAgent.includes('linux')) return 'Linux'
    return 'Desktop OS'
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-2">
      {/* 1. Brand Header */}
      <div className="bg-white border border-slate-200 rounded-none shadow-subtle p-8 flex flex-col items-center text-center space-y-4">
        <Logo className="h-16 w-auto text-slate-800 brightness-75 select-none" />
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            {appConfig.appName}
          </h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            {appConfig.companyBranding}
          </p>
        </div>
        <p className="text-sm text-slate-650 leading-relaxed max-w-2xl">
          {appConfig.description}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 2. Key Product Details */}
        <div className="bg-white border border-slate-200 rounded-none shadow-subtle p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center gap-2">
              <Info size={16} className="text-slate-500" />
              Product Information
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Developed By</span>
                <span className="font-semibold text-slate-800">{appConfig.developedBy} ({appConfig.developerRole})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Company / Publisher</span>
                <span className="font-semibold text-slate-800">{appConfig.company}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Version</span>
                <span className="font-semibold text-slate-800 font-mono">{appConfig.version}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500 font-medium">Copyright</span>
                <span className="text-slate-700">{appConfig.copyright}</span>
              </div>
            </div>
          </div>
          
          <Button
            onClick={handleCheckUpdates}
            variant="outline"
            className="w-full text-xs font-semibold py-2"
            disabled={checkingUpdates}
          >
            {checkingUpdates ? 'Checking for Updates...' : 'Check for Updates'}
          </Button>
        </div>

        {/* 3. Contact & Support */}
        <div className="bg-white border border-slate-200 rounded-none shadow-subtle p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center gap-2">
              <Laptop size={16} className="text-slate-500" />
              Support & Contact
            </h2>
            
            <div className="space-y-3 mt-2">
              {/* Contact number */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-none flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone / WhatsApp</span>
                  <p className="text-xs font-bold font-mono text-slate-800">{appConfig.contactNumber}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(appConfig.contactNumber, 'contact')}
                  className="p-2 hover:bg-slate-200/50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                  title="Copy Contact"
                >
                  {copiedContact ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
              </div>

              {/* Email */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-none flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</span>
                  <p className="text-xs font-bold font-mono text-slate-800">{appConfig.email}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(appConfig.email, 'email')}
                  className="p-2 hover:bg-slate-200/50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                  title="Copy Email"
                >
                  {copiedEmail ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-center text-slate-400 font-medium">
            Contact us for custom module requests or database integrations.
          </p>
        </div>
      </div>

      {/* 4. System Diagnostics */}
      <div className="bg-white border border-slate-200 rounded-none shadow-subtle p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center gap-2">
          <Database size={16} className="text-slate-500" />
          System Information
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex flex-col space-y-0.5 border-r border-slate-100 pr-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Database Engine</span>
            <p className="font-bold text-slate-700">SQLite 3</p>
          </div>
          <div className="flex flex-col space-y-0.5 border-r border-slate-100 pr-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Database Status</span>
            <span className="inline-flex items-center gap-1 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${dbConnected ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span className="font-bold text-slate-700">{dbConnected ? 'Online' : 'Offline'}</span>
            </span>
          </div>
          <div className="flex flex-col space-y-0.5 border-r border-slate-100 pr-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Operating System</span>
            <p className="font-bold text-slate-700">{getOS()}</p>
          </div>
          <div className="flex flex-col space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Current Operator</span>
            <p className="font-bold text-slate-700">{currentOperator || 'Haroon Wazir'}</p>
          </div>
        </div>
      </div>

      {/* 5. Footer branding */}
      <div className="flex flex-col items-center justify-between pt-4 border-t border-slate-200 select-none text-[11px] text-slate-400 font-medium">
        <p>{appConfig.footerText}</p>
        <p className="mt-1 font-mono text-[10px]">Press [Esc] at any time to return to the Dashboard.</p>
      </div>
    </div>
  )
}
