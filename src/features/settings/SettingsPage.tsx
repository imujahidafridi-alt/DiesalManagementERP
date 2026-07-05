import { useState, useEffect } from 'react'
import { Button, Input, Select, useShortcutEffect } from '@/components/ui'
import { useUiStore, useAppStore } from '@/store'
import {
  Save,
  Database,
  ShieldCheck,
  RotateCcw,
  Sliders,
  Building,
  HardDrive,
  Cpu,
  Keyboard,
  Info,
} from 'lucide-react'

export default function SettingsPage() {
  const { addToast, showDialog } = useUiStore()
  const { settings, fetchSettings, saveSettings } = useAppStore()

  // Tab State: company, rules, backup, db, shortcuts
  const [activeTab, setActiveTab] = useState<'company' | 'rules' | 'backup' | 'db' | 'shortcuts'>('company')

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  
  // Backup list and diagnostics state
  const [backups, setBackups] = useState<any[]>([])
  const [integrityStatus, setIntegrityStatus] = useState<{ checked: boolean; ok: boolean; issues: string[] }>({
    checked: false,
    ok: true,
    issues: [],
  })

  // Sync state on load
  const loadConfig = async () => {
    setLoading(true)
    try {
      await fetchSettings()
      // Load backups history
      const list = await window.api.invoke('backup:list')
      setBackups(list || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  const handleInputChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const triggerSave = async () => {
    setLoading(true)
    try {
      const ok = await saveSettings(formData)
      if (ok) {
        addToast('Application configurations saved successfully', 'success')
      } else {
        addToast('Failed to save settings', 'error')
      }
    } catch (err: any) {
      addToast(err.message || 'Error occurred while saving configurations', 'error')
    } finally {
      setLoading(false)
    }
  }

  useShortcutEffect('save', triggerSave)

  // ----------------------------------------------------
  // BACKUP OPERATIONS HANDLERS
  // ----------------------------------------------------
  const handleManualBackup = async () => {
    showDialog({
      title: 'Run Instant Gzip Backup',
      message: 'This will lock the ledger database briefly to generate a compressed backup. Proceed?',
      type: 'confirm',
      confirmText: 'Generate Backup',
      onConfirm: async () => {
        try {
          const path = await window.api.invoke('backup:create', 'Manual_Admin')
          addToast(`Backup created successfully: ${path.split('\\').pop()}`, 'success')
          // Refresh list
          const list = await window.api.invoke('backup:list')
          setBackups(list || [])
        } catch (e: any) {
          addToast(e.message || 'Failed to create backup', 'error')
        }
      },
    })
  }

  const handleRestoreBackup = (bk: any) => {
    showDialog({
      title: 'DANGER: RESTORE DATABASE',
      message: `Are you absolutely sure you want to restore the database to the snapshot from ${new Date(bk.createdAt).toLocaleString()}? All ledger entries created after this timestamp will be PERMANENTLY lost. The application will automatically relaunch on completion.`,
      type: 'confirm',
      confirmText: 'Restore & Reboot',
      onConfirm: async () => {
        try {
          addToast('Restoring database. Please do not close the app.', 'info')
          await window.api.invoke('backup:restore', bk.path)
          addToast('Restore succeeded. Restarting application...', 'success')
          setTimeout(() => {
            window.api.invoke('app:reboot')
          }, 1500)
        } catch (e: any) {
          showDialog({
            title: 'Restore Failed',
            message: `Restore operation was aborted to prevent data corruption. Error: ${e.message}`,
            type: 'warning',
          })
        }
      },
    })
  }

  // ----------------------------------------------------
  // INTEGRITY & MAINTENANCE HANDLERS
  // ----------------------------------------------------
  const handleIntegrityCheck = async () => {
    try {
      const res = await window.api.invoke('db:integrityCheck')
      setIntegrityStatus({
        checked: true,
        ok: res.ok,
        issues: res.issues,
      })
      if (res.ok) {
        addToast('Database integrity verification check passed.', 'success')
      } else {
        addToast('Database inconsistencies detected!', 'error')
      }
    } catch (e: any) {
      addToast(`Integrity check failed: ${e.message}`, 'error')
    }
  }

  const handleOptimizeDb = async () => {
    try {
      addToast('Optimizing database indices...', 'info')
      await window.api.invoke('db:optimize')
      addToast('Database VACUUM and ANALYZE operations completed', 'success')
    } catch (e: any) {
      addToast(`Optimization failed: ${e.message}`, 'error')
    }
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider text-gray-900">Application Configuration</h1>
          <p className="text-[11px] text-gray-500">Configure global company localization settings, inventory rules, backups, and maintenance triggers.</p>
        </div>

        <Button variant="primary" size="sm" onClick={triggerSave} isLoading={loading} className="gap-2">
          <Save size={13} />
          <span>Save Changes <kbd className="text-[9px] text-blue-200 font-mono ml-1">Ctrl+S</kbd></span>
        </Button>
      </div>

      {/* Tabs Selector Navigation */}
      <div className="flex border-b border-gray-200 bg-white p-1 rounded-t border shrink-0 no-print select-none">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'company' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Building size={13} />
          <span>Company & Localization</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'rules' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Sliders size={13} />
          <span>Business & Inventory Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'backup' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <HardDrive size={13} />
          <span>Auto-Backup Preferences</span>
        </button>

        <button
          onClick={() => setActiveTab('db')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'db' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Cpu size={13} />
          <span>Database Tools</span>
        </button>

        <button
          onClick={() => setActiveTab('shortcuts')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'shortcuts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Keyboard size={13} />
          <span>Shortcuts Legend</span>
        </button>
      </div>

      {/* Main Tab Panel Area */}
      <div className="bg-white border border-t-0 rounded-b p-5 shadow-subtle min-h-[50vh]">
        
        {/* TAB 1: Company Profile & Localization */}
        {activeTab === 'company' && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-b pb-2">Company Localization Profile</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Company Registered Name"
                value={formData.company_name || ''}
                onChange={(e) => handleInputChange('company_name', e.target.value)}
                required
              />
              <Input
                label="Registered Corporate Address"
                value={formData.company_address || ''}
                onChange={(e) => handleInputChange('company_address', e.target.value)}
              />
              <Input
                label="Contact Phone"
                value={formData.company_phone || ''}
                onChange={(e) => handleInputChange('company_phone', e.target.value)}
              />
              <Input
                label="Contact Email"
                value={formData.company_email || ''}
                onChange={(e) => handleInputChange('company_email', e.target.value)}
              />
              <Input
                label="Currency (e.g. AED, USD, PKR)"
                value={formData.currency || ''}
                onChange={(e) => handleInputChange('currency', e.target.value)}
                required
              />
              <Input
                label="Currency Symbol (e.g. AED, $, Rs)"
                value={formData.currency_symbol || ''}
                onChange={(e) => handleInputChange('currency_symbol', e.target.value)}
                required
              />
              <Select
                label="Quantity Decimal Precision"
                value={formData.quantity_precision || '2'}
                onChange={(e: any) => handleInputChange('quantity_precision', e.target.value)}
                options={[
                  { value: '0', label: '0 decimals' },
                  { value: '1', label: '1 decimals' },
                  { value: '2', label: '2 decimals (Default)' },
                  { value: '3', label: '3 decimals' },
                ]}
              />
            </div>
          </div>
        )}

        {/* TAB 2: Business & Inventory Rules */}
        {activeTab === 'rules' && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-b pb-2">Business & Ledger Constraints</h3>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Negative Stock Policy"
                value={formData.negative_inventory_policy || 'BLOCK'}
                onChange={(e: any) => handleInputChange('negative_inventory_policy', e.target.value)}
                options={[
                  { value: 'BLOCK', label: 'Block Invoices Exceeding Available Stock (Recommended)' },
                  { value: 'ALLOW', label: 'Allow Negative Balances' },
                ]}
              />

              <Input
                label="WAC Decimal Precision"
                value={formData.price_precision || '2'}
                onChange={(e) => handleInputChange('price_precision', e.target.value)}
                placeholder="2"
              />

              <Input
                label="Quantity Unit Name (e.g. Gallon, Liter)"
                value={formData.quantity_unit || ''}
                onChange={(e) => handleInputChange('quantity_unit', e.target.value)}
                required
              />
              <Input
                label="Quantity Unit Abbreviation (e.g. Gal, L)"
                value={formData.quantity_abbreviation || ''}
                onChange={(e) => {
                  handleInputChange('quantity_abbreviation', e.target.value)
                  handleInputChange('fuel_unit', e.target.value)
                }}
                required
              />

              <div className="col-span-2 border bg-gray-50 p-4 rounded text-[11px] text-gray-500 leading-relaxed space-y-2 select-none">
                <div className="font-bold flex items-center gap-1 text-gray-700">
                  <Info size={12} />
                  <span>Ledger Enforcement Policy</span>
                </div>
                <p>
                  Blocking negative inventory protects ledger values by preventing sales transactions when carrying balances do not justify the volume.
                </p>
                <p>
                  All costs are computed chronologically using the **Weighted Average Cost (WAC)** formula. Changes to precision values only adjust decimal display thresholds.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Auto-Backup Preferences */}
        {activeTab === 'backup' && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-b pb-2">Backup & Storage Configurations</h3>
            
            <div className="space-y-4">
              <Input
                label="Backup Output Folder Path"
                value={formData.default_backup_folder || ''}
                onChange={(e) => handleInputChange('default_backup_folder', e.target.value)}
                placeholder="Defaults to Documents/Malak_ERP_Backups"
              />

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Retention Backup Limit Count"
                  value={formData.max_backup_count || '10'}
                  onChange={(e: any) => handleInputChange('max_backup_count', e.target.value)}
                  options={[
                    { value: '5', label: '5 Backups' },
                    { value: '10', label: '10 Backups (Recommended)' },
                    { value: '20', label: '20 Backups' },
                    { value: '50', label: '50 Backups' },
                  ]}
                />

                <Select
                  label="Auto Backup Frequency"
                  value={formData.auto_backup_frequency || 'Daily'}
                  onChange={(e: any) => handleInputChange('auto_backup_frequency', e.target.value)}
                  options={[
                    { value: 'Hourly', label: 'Every Hour' },
                    { value: 'Daily', label: 'Once a Day (Daily)' },
                    { value: 'Weekly', label: 'Once a Week' },
                    { value: 'Manual', label: 'Manual trigger only' },
                  ]}
                />

                <Select
                  label="Run Backup on Startup"
                  value={formData.startup_backup_enabled || 'false'}
                  onChange={(e: any) => handleInputChange('startup_backup_enabled', e.target.value)}
                  options={[
                    { value: 'true', label: 'Enabled' },
                    { value: 'false', label: 'Disabled' },
                  ]}
                />

                <Select
                  label="Run Backup on Shutdown"
                  value={formData.shutdown_backup_enabled || 'false'}
                  onChange={(e: any) => handleInputChange('shutdown_backup_enabled', e.target.value)}
                  options={[
                    { value: 'true', label: 'Enabled' },
                    { value: 'false', label: 'Disabled' },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Database Diagnostics & Maintenance Tools */}
        {activeTab === 'db' && (
          <div className="space-y-5">
            {/* Quick Actions Panel */}
            <div className="flex flex-wrap gap-3.5 border-b pb-4">
              <Button variant="primary" size="sm" onClick={handleManualBackup} className="gap-2">
                <Database size={13} />
                <span>Backup Database Now</span>
              </Button>

              <Button variant="outline" size="sm" onClick={handleIntegrityCheck} className="gap-2">
                <ShieldCheck size={13} />
                <span>Verify SQL Integrity</span>
              </Button>

              <Button variant="outline" size="sm" onClick={handleOptimizeDb} className="gap-2">
                <RotateCcw size={13} />
                <span>Optimize Storage indices</span>
              </Button>
            </div>

            {/* Diagnostics result output */}
            {integrityStatus.checked && (
              <div className={`p-4 rounded border text-xs leading-relaxed font-mono space-y-1.5 ${
                integrityStatus.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                  {integrityStatus.ok ? <ShieldCheck size={14} /> : <AlertOctagonIcon size={14} />}
                  <span>Database Diagnosis: {integrityStatus.ok ? 'OK' : 'INCONSISTENT'}</span>
                </div>
                {integrityStatus.issues.length === 0 ? (
                  <p>All database block allocations, structural schemas, constraints, and foreign keys pass verified integrity tests.</p>
                ) : (
                  <ul className="list-disc pl-4 space-y-1 select-text">
                    {integrityStatus.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Backups History Grid List */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Backup History logs (.db.gz)</span>
              
              <div className="border rounded overflow-hidden bg-gray-50">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      <th className="p-2.5">Filename</th>
                      <th className="p-2.5">Date Created</th>
                      <th className="p-2.5">File Size</th>
                      <th className="p-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-gray-400 bg-white select-none">
                          No database backups discovered. Click "Backup Database Now" to generate one.
                        </td>
                      </tr>
                    ) : (
                      backups.map((bk) => (
                        <tr key={bk.filename} className="border-b bg-white hover:bg-gray-50/50">
                          <td className="p-2.5 font-mono text-[10px] select-text">{bk.filename}</td>
                          <td className="p-2.5 text-gray-600">{new Date(bk.createdAt).toLocaleString()}</td>
                          <td className="p-2.5 text-gray-600">{(bk.sizeBytes / 1024).toFixed(1)} KB</td>
                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => handleRestoreBackup(bk)}
                              className="px-2 py-0.5 border text-[10px] font-bold text-blue-600 rounded bg-blue-50 border-blue-200 hover:bg-blue-100 hover:text-blue-700 cursor-pointer"
                            >
                              Restore Point
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Keyboard Shortcuts Legend */}
        {activeTab === 'shortcuts' && (
          <div className="space-y-4 max-w-xl select-none">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider border-b pb-2">Application Shortcuts Map</h3>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    <th className="p-2.5">Keyboard Combo</th>
                    <th className="p-2.5">Action / Target Page</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-medium text-gray-700">
                  <tr>
                    <td className="p-2.5"><kbd className="bg-gray-50 border px-1.5 py-0.5 rounded font-mono text-[10px] text-gray-600">Ctrl+F</kbd></td>
                    <td className="p-2.5">Open Global lookup Search overlay</td>
                  </tr>
                  <tr>
                    <td className="p-2.5"><kbd className="bg-gray-50 border px-1.5 py-0.5 rounded font-mono text-[10px] text-gray-600">Ctrl+S</kbd></td>
                    <td className="p-2.5">Trigger Save changes (Settings, Forms)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5"><kbd className="bg-gray-50 border px-1.5 py-0.5 rounded font-mono text-[10px] text-gray-600">Ctrl+R</kbd></td>
                    <td className="p-2.5">Refresh loaded workspace resources / reports</td>
                  </tr>
                  <tr>
                    <td className="p-2.5"><kbd className="bg-gray-50 border px-1.5 py-0.5 rounded font-mono text-[10px] text-gray-600">Escape</kbd></td>
                    <td className="p-2.5">Close modal dialouges and exit search dialog</td>
                  </tr>
                  <tr>
                    <td className="p-2.5"><kbd className="bg-gray-50 border px-1.5 py-0.5 rounded font-mono text-[10px] text-gray-600">Alt+P</kbd></td>
                    <td className="p-2.5">Trigger print layouts preview page</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AlertOctagonIcon(props: any) {
  return <Cpu {...props} className="text-red-500" />
}
