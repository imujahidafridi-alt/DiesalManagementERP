import React from 'react'
import { Search, X } from 'lucide-react'
import clsx from 'clsx'

interface SearchBoxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void
}

export default function SearchBox({ className, value, onChange, onClear, ...props }: SearchBoxProps) {
  return (
    <div className="relative flex items-center w-full max-w-sm">
      <Search className="absolute left-2.5 text-gray-400 shrink-0" size={14} />
      <input
        type="text"
        value={value}
        onChange={onChange}
        className={clsx(
          'flex h-8 w-full rounded border border-gray-300 bg-white pl-8 pr-7 text-xs transition-colors placeholder:text-gray-400 focus-ring hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
      {value && onClear && (
        <button
          onClick={onClear}
          className="absolute right-2.5 text-gray-400 hover:text-gray-600 transition-colors"
          title="Clear search"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
