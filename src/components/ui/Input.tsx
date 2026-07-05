import React from 'react'
import clsx from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, helperText, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider select-none">
            {label}
          </label>
        )}
        <input
          type={type}
          className={clsx(
            'flex h-8 w-full rounded border border-gray-300 bg-white px-2.5 py-1 text-xs transition-colors placeholder:text-gray-400 focus-ring hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500 focus-visible:ring-red-500',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <span className="text-[10px] font-medium text-red-600 select-none">{error}</span>}
        {!error && helperText && (
          <span className="text-[10px] text-gray-400 select-none">{helperText}</span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
