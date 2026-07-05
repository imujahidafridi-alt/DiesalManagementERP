import React from 'react'
import clsx from 'clsx'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'gray'
}

export default function Badge({ className, variant = 'gray', children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider select-none border',
        {
          'bg-green-50 text-green-700 border-green-200': variant === 'success',
          'bg-yellow-50 text-yellow-700 border-yellow-200': variant === 'warning',
          'bg-red-50 text-red-700 border-red-200': variant === 'error',
          'bg-blue-50 text-blue-700 border-blue-200': variant === 'info',
          'bg-gray-50 text-gray-700 border-gray-200': variant === 'gray',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
