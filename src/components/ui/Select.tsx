import React from 'react'
import clsx from 'clsx'

interface SelectOption {
  value: string | number
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  label?: string
  error?: string
  placeholder?: string
}

export default function Select({
  className,
  options,
  label,
  error,
  placeholder,
  id,
  required,
  ...props
}: SelectProps) {
  const selectId = id || React.useId()

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          required={required}
          className={clsx(
            'w-full px-3 py-1.5 text-xs bg-white border rounded shadow-subtle focus-ring appearance-none pr-8 cursor-pointer',
            error ? 'border-red-400 focus-visible:ring-red-400' : 'border-gray-300',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
          <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
      {error && <p className="text-[10px] text-red-600 font-medium">{error}</p>}
    </div>
  )
}
