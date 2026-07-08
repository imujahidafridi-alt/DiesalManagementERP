import React from 'react'
import clsx from 'clsx'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export default function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center font-semibold rounded-[10px] focus-ring border transition-all duration-200 shadow-sm transform hover:-translate-y-0.5 active:translate-y-0 select-none',
        // Variants
        {
          'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 active:from-blue-700 active:to-blue-600 text-white border-transparent': variant === 'primary',
          'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-250/60': variant === 'secondary',
          'bg-white hover:bg-blue-50/50 hover:text-blue-600 hover:border-blue-200 text-gray-700 border-gray-200': variant === 'outline',
          'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 active:from-red-700 active:to-red-600 text-white border-transparent': variant === 'destructive',
        },
        // Sizes
        {
          'px-3.5 py-1.5 text-[11px]': size === 'sm',
          'px-4 py-2 text-xs': size === 'md',
          'px-6 py-3 text-sm': size === 'lg',
        },
        // State
        (disabled || isLoading) && 'opacity-60 cursor-not-allowed transform-none hover:translate-y-0 active:translate-y-0',
        className
      )}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-current"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
