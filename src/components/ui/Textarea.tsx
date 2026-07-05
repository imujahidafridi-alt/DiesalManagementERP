import React from 'react'
import clsx from 'clsx'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
  label?: string
}

export default function Textarea({
  className,
  error,
  label,
  id,
  required,
  ...props
}: TextareaProps) {
  const textareaId = id || React.useId()

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={textareaId} className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        required={required}
        className={clsx(
          'w-full px-3 py-1.5 text-xs bg-white border rounded shadow-subtle focus-ring resize-y min-h-[60px]',
          error ? 'border-red-400 focus-visible:ring-red-400' : 'border-gray-300',
          className
        )}
        {...props}
      />
      {error && <p className="text-[10px] text-red-600 font-medium">{error}</p>}
    </div>
  )
}
