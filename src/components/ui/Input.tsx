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
            'flex h-9 w-full rounded-lg border border-gray-250 bg-white px-3 py-1.5 text-xs transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm',
            error && 'border-red-500 focus:ring-red-500/20 focus:border-red-500',
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
