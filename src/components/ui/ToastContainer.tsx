import { useUiStore } from '@/store'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import clsx from 'clsx'

export default function ToastContainer() {
  const { toasts, removeToast } = useUiStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none">
      {toasts.map((toast) => {
        const Icon = {
          success: CheckCircle,
          error: XCircle,
          info: Info,
        }[toast.type]

        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto p-3.5 rounded border shadow-lg flex items-start gap-3 bg-white transition-all transform duration-300',
              {
                'border-green-200 text-green-800 bg-green-50/20': toast.type === 'success',
                'border-red-200 text-red-800 bg-red-50/20': toast.type === 'error',
                'border-blue-200 text-blue-800 bg-blue-50/20': toast.type === 'info',
              }
            )}
          >
            <Icon
              size={16}
              className={clsx('shrink-0 mt-0.5', {
                'text-green-600': toast.type === 'success',
                'text-red-600': toast.type === 'error',
                'text-blue-600': toast.type === 'info',
              })}
            />
            <div className="flex-1 text-xs font-medium leading-relaxed">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
