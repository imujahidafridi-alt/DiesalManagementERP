import React, { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { ChevronDown, Search, Plus } from 'lucide-react'

interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  error?: string
  required?: boolean
  className?: string
  onCreateCustom?: (name: string) => void | Promise<void>
}

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  label,
  error,
  required,
  className,
  onCreateCustom,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter options based on search query
  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  )

  const selectedOption = options.find((opt) => opt.value === value)

  // Reset search and active index when combobox closes/opens
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setActiveIndex(0)
      inputRef.current?.focus()
    }
  }, [isOpen])

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

  // Keyboard navigation inside options dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0))
        e.preventDefault()
        break
      case 'ArrowUp':
        setActiveIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0))
        e.preventDefault()
        break
      case 'Enter': {
        const hasExactMatch = options.some(
          (opt) => opt.label.toLowerCase() === search.trim().toLowerCase()
        )
        const showAddCustomOption = onCreateCustom && search.trim() && !hasExactMatch

        if (filtered.length === 0 && showAddCustomOption) {
          onCreateCustom(search.trim())
          setIsOpen(false)
        } else if (filtered[activeIndex]) {
          onChange(filtered[activeIndex].value)
          setIsOpen(false)
        }
        e.preventDefault()
        break
      }
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
    <div className={clsx('space-y-1 relative select-none', className)} ref={containerRef}>
      {label && (
        <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      
      {/* Target Trigger Box */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className={clsx(
          'w-full px-3 py-1.5 text-xs bg-white border rounded shadow-subtle flex items-center justify-between cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500',
          error ? 'border-red-400' : 'border-gray-300'
        )}
      >
        <span className={clsx(selectedOption ? 'text-gray-900' : 'text-gray-400')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </div>

      {/* Floating Options Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border rounded shadow-lg max-h-60 overflow-hidden flex flex-col">
          {/* Inner Search Box */}
          <div className="flex items-center gap-2 border-b px-2.5 py-1.5 shrink-0 bg-gray-50">
            <Search size={12} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent text-xs focus:outline-none placeholder-gray-400 select-text"
              placeholder="Type to filter..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Filtered Option Lists */}
          <div className="overflow-auto py-1">
            {(() => {
              const hasExactMatch = options.some(
                (opt) => opt.label.toLowerCase() === search.trim().toLowerCase()
              )
              const showAddCustomOption = onCreateCustom && search.trim() && !hasExactMatch

              return (
                <>
                  {showAddCustomOption && (
                    <div
                      onClick={async () => {
                        await onCreateCustom(search.trim())
                        setIsOpen(false)
                      }}
                      className="px-3 py-2 text-xs cursor-pointer text-blue-600 font-bold hover:bg-blue-50 border-b flex items-center gap-1.5"
                    >
                      <Plus size={12} />
                      Add & Register "{search.trim()}"
                    </div>
                  )}
                  {filtered.length === 0 ? (
                    !showAddCustomOption && <div className="px-3 py-2 text-xs text-gray-400 text-center">No options found.</div>
                  ) : (
                    filtered.map((opt, idx) => {
                      const isSelected = value === opt.value
                      const isActive = idx === activeIndex

                      return (
                        <div
                          key={opt.value}
                          onClick={() => {
                            onChange(opt.value)
                            setIsOpen(false)
                          }}
                          className={clsx(
                            'px-3 py-1.5 text-xs cursor-pointer transition-colors',
                            isSelected && 'font-bold bg-blue-50/50 text-blue-600',
                            isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                          )}
                        >
                          {opt.label}
                        </div>
                      )
                    })
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {error && <p className="text-[10px] text-red-600 font-medium">{error}</p>}
    </div>
  )
}
