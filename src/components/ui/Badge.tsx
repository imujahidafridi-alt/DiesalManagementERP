import React from 'react'
import clsx from 'clsx'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'gray'
}

export default function Badge({ className, variant = 'gray', children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider select-none border shadow-sm transition-all',
        {
          'bg-gradient-to-r from-emerald-50/80 to-teal-50/50 text-emerald-700 border-emerald-200/60': variant === 'success',
          'bg-gradient-to-r from-amber-50/80 to-yellow-50/50 text-amber-700 border-amber-200/60': variant === 'warning',
          'bg-gradient-to-r from-rose-50/80 to-red-50/50 text-rose-700 border-rose-200/60': variant === 'error',
          'bg-gradient-to-r from-blue-50/80 to-indigo-50/50 text-blue-700 border-blue-200/60': variant === 'info',
          'bg-gradient-to-r from-slate-50/80 to-gray-50/50 text-slate-700 border-slate-200/60': variant === 'gray',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
