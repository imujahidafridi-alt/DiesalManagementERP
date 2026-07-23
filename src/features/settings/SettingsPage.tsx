import { useState, useEffect } from 'react'
import { Button, Input, Select, useShortcutEffect } from '@/components/ui'
import { useUiStore, useAppStore } from '@/store'
import {
  Save,
  Sliders,
  Building,
  Keyboard,
  Info,
  Lock,
  Shield,
  KeyRound,
} from 'lucide-react'

export default function SettingsPage() {
  const { addToast } = useUiStore()
  const {
    settings,
    fetchSettings,
    saveSettings,
    changePin,
    inactivityTimeoutMinutes,
    setInactivityTimeoutMinutes,
  } = useAppStore()

  // Tab State: company, rules, security, shortcuts
  const [activeTab, setActiveTab] = useState<'company' | 'rules' | 'security' | 'shortcuts'>('company')

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  
  // Change PIN form state
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmNewPin, setConfirmNewPin] = useState('')
  const [pinChanging, setPinChanging] = useState(false)


  // Sync state on load
  const loadConfig = async () => {
    setLoading(true)
    try {
      await fetchSettings()
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

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPin) {
      addToast('Current PIN is required', 'error')
      return
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      addToast('New PIN must be 4 to 8 numeric digits', 'error')
      return
    }
    if (newPin !== confirmNewPin) {
      addToast('New PIN and confirmation PIN do not match', 'error')
      return
    }

    setPinChanging(true)
    try {
      const res = await changePin(currentPin, newPin)
      if (res.success) {
        addToast('Security PIN changed successfully', 'success')
        setCurrentPin('')
        setNewPin('')
        setConfirmNewPin('')
      } else {
        addToast(res.error || 'Failed to change PIN', 'error')
      }
    } catch {
      addToast('Error changing security PIN', 'error')
    } finally {
      setPinChanging(false)
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
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'security' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Shield size={13} />
          <span>Security & PIN</span>
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

        {/* TAB 3: SECURITY & PIN AUTHENTICATION (Supabase Auth Migration Ready) */}
        {activeTab === 'security' && (
          <div className="space-y-6 max-w-2xl">
            {/* 1. Change PIN Section */}
            <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <KeyRound size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">Change Security PIN</h3>
                  <p className="text-[11px] text-gray-500">Update operator security PIN for terminal lock & sensitive actions.</p>
                </div>
              </div>

              <form onSubmit={handleChangePin} className="space-y-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">Current Security PIN</label>
                  <Input
                    type="password"
                    maxLength={8}
                    required
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter current PIN"
                    className="font-mono tracking-widest text-center"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">New Security PIN (4–8 digits)</label>
                    <Input
                      type="password"
                      maxLength={8}
                      required
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter new 4-8 digit PIN"
                      className="font-mono tracking-widest text-center"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">Confirm New Security PIN</label>
                    <Input
                      type="password"
                      maxLength={8}
                      required
                      value={confirmNewPin}
                      onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Confirm new PIN"
                      className="font-mono tracking-widest text-center"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={pinChanging}
                    disabled={!currentPin || !newPin || newPin !== confirmNewPin}
                    className="gap-2"
                  >
                    <Shield size={14} />
                    <span>Update Security PIN</span>
                  </Button>
                </div>
              </form>
            </div>

            {/* 2. Inactivity Timeout Section */}
            <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <Lock size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">Inactivity Auto-Lock Duration</h3>
                  <p className="text-[11px] text-gray-500">Automatically lock the application terminal after period of operator inactivity.</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-bold text-gray-700 block">Auto-Lock Inactivity Timeout</label>
                <Select
                  value={String(inactivityTimeoutMinutes)}
                  onChange={(val: any) => setInactivityTimeoutMinutes(parseInt(typeof val === 'string' ? val : val?.target?.value || '0', 10))}
                  options={[
                    { value: '0', label: 'Disabled (Never auto-lock)' },
                    { value: '5', label: '5 Minutes' },
                    { value: '15', label: '15 Minutes (Recommended)' },
                    { value: '30', label: '30 Minutes' },
                    { value: '60', label: '60 Minutes' },
                  ]}
                />
                <p className="text-[10px] text-gray-500 italic">
                  Note: You can also manually lock the application at any time by clicking "Lock" in the top bar or sidebar.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Keyboard Shortcuts Legend */}
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

