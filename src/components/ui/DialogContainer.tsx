import { useState } from 'react'
import { useUiStore } from '@/store'
import Button from './Button'
import { AlertTriangle, Trash2, HelpCircle, CheckCircle, Info } from 'lucide-react'
import clsx from 'clsx'

export default function DialogContainer() {
  const { dialog, closeDialog } = useUiStore()
  const [loading, setLoading] = useState(false)

  if (!dialog) return null

  const handleConfirm = async () => {
    if (dialog.onConfirm) {
      try {
        setLoading(true)
        await dialog.onConfirm()
      } catch (err) {
        console.error('Dialog confirm action error:', err)
      } finally {
        setLoading(false)
      }
    }
    closeDialog()
  }

  const handleCancel = () => {
    if (dialog.onCancel) {
      dialog.onCancel()
    }
    closeDialog()
  }

  // Resolve headers and icons
  const { Icon, iconColor, btnTheme } = {
    confirm: { Icon: HelpCircle, iconColor: 'text-blue-500 bg-blue-50', btnTheme: 'primary' as const },
    delete: { Icon: Trash2, iconColor: 'text-red-500 bg-red-50', btnTheme: 'destructive' as const },
    warning: { Icon: AlertTriangle, iconColor: 'text-yellow-500 bg-yellow-50', btnTheme: 'primary' as const },
    info: { Icon: Info, iconColor: 'text-gray-500 bg-gray-50', btnTheme: 'primary' as const },
    success: { Icon: CheckCircle, iconColor: 'text-green-500 bg-green-50', btnTheme: 'primary' as const },
  }[dialog.type]

  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center p-4 select-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/40" onClick={handleCancel} />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-sm bg-white rounded border shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 flex gap-4 items-start">
          <div className={clsx('p-2.5 rounded shrink-0', iconColor)}>
            <Icon size={20} />
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 leading-none">{dialog.title}</h3>
            <p className="text-xs text-gray-500 leading-normal select-text">{dialog.message}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-gray-50 px-5 py-3.5 border-t flex items-center justify-end gap-2.5 shrink-0">
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
            {dialog.cancelText || 'Cancel'}
          </Button>
          <Button variant={btnTheme} size="sm" onClick={handleConfirm} isLoading={loading}>
            {dialog.confirmText || (dialog.type === 'delete' ? 'Delete' : 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
