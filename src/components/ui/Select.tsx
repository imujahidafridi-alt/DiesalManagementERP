import React, { useState, useRef, useEffect, useImperativeHandle } from 'react'
import clsx from 'clsx'

interface SelectOption {
  value: string | number
  label: string
}

interface SelectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'value'> {
  options: SelectOption[]
  value?: string | number
  onChange?: (e: { target: { value: string; name?: string } }) => void
  label?: string
  error?: string
  disabled?: boolean
  name?: string
  placeholder?: string
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ className, options, value, onChange, label, error, disabled, name, placeholder, ...props }, ref) => {
    const [isOpen, setIsOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)

    const containerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement)

    const selectedOption = options.find((opt) => String(opt.value) === String(value))

    // Handle outside clicks to close the dropdown
    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Synchronize active index with current value when opening
    useEffect(() => {
      if (isOpen && value !== undefined) {
        const idx = options.findIndex((opt) => String(opt.value) === String(value))
        if (idx !== -1) {
          setActiveIndex(idx)
        }
      }
    }, [isOpen, value, options])

    const handleSelect = (val: string | number) => {
      if (disabled) return
      if (onChange) {
        onChange({ target: { value: String(val), name } })
      }
      setIsOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return

      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          setIsOpen(true)
          e.preventDefault()
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          setActiveIndex((prev) => (options.length > 0 ? (prev + 1) % options.length : 0))
          e.preventDefault()
          break
        case 'ArrowUp':
          setActiveIndex((prev) => (options.length > 0 ? (prev - 1 + options.length) % options.length : 0))
          e.preventDefault()
          break
        case 'Enter':
        case ' ':
          if (options[activeIndex]) {
            handleSelect(options[activeIndex].value)
          }
          e.preventDefault()
          break
        case 'Escape':
          setIsOpen(false)
          e.preventDefault()
          break
        case 'Tab':
          setIsOpen(false)
          break
      }
    }

    return (
      <div className="flex flex-col gap-1 w-full relative select-none">
        {label && (
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            {label}
          </label>
        )}
        <div
          ref={containerRef}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleKeyDown}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={clsx(
            'relative flex h-9 w-full items-center justify-between rounded-lg border bg-white pl-3.5 pr-8 py-1.5 text-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50 select-none text-gray-800 shadow-sm',
            disabled && 'cursor-not-allowed opacity-50 bg-gray-50 hover:border-gray-250',
            error 
              ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' 
              : 'border-gray-250 focus:ring-blue-500/20 focus:border-blue-500',
            className
          )}
          {...props}
        >
          <span className={clsx('truncate', (!selectedOption || selectedOption.value === '') ? 'text-gray-400' : 'text-gray-800')}>
            {selectedOption ? selectedOption.label : (placeholder || 'Select option...')}
          </span>
          <div className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400">
            <svg className="fill-current h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>

          {/* Custom Floating Options list */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 bg-white border border-gray-200/60 rounded-xl shadow-2xl max-h-60 overflow-auto py-1 animate-in fade-in slide-in-from-top-1 duration-150">
              {options.map((opt, idx) => {
                const isSelected = String(value) === String(opt.value)
                const isActive = idx === activeIndex

                return (
                  <div
                    key={opt.value}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelect(opt.value)
                    }}
                    className={clsx(
                      'px-3.5 py-2 text-xs cursor-pointer transition-colors truncate',
                      isSelected && 'font-bold bg-blue-50/70 text-blue-600',
                      isActive ? 'bg-blue-600 text-white font-semibold' : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {opt.label}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {error && <span className="text-[10px] font-medium text-red-600">{error}</span>}
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select
