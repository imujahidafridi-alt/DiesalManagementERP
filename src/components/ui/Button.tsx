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
        'inline-flex items-center justify-center font-medium rounded focus-ring border transition-colors select-none',
        // Variants
        {
          'bg-blue-600 hover:bg-blue-700 text-white border-blue-600': variant === 'primary',
          'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-200': variant === 'secondary',
          'bg-white hover:bg-gray-50 text-gray-700 border-gray-300': variant === 'outline',
          'bg-red-600 hover:bg-red-700 text-white border-red-600': variant === 'destructive',
        },
        // Sizes
        {
          'px-2.5 py-1 text-xs': size === 'sm',
          'px-3.5 py-1.5 text-xs': size === 'md',
          'px-5 py-2.5 text-sm': size === 'lg',
        },
        // State
        (disabled || isLoading) && 'opacity-60 cursor-not-allowed',
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
