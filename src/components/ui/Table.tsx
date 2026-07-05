import React from 'react'
import clsx from 'clsx'

// 1. Table Wrapper with Scroll Area
export function Table({ className, children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto border border-gray-200 rounded bg-white shadow-subtle">
      <table className={clsx('w-full text-left border-collapse text-xs', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

// 2. Table Header
export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={clsx('bg-gray-50 border-b select-none', className)} {...props} />
}

// 3. Table Body
export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={clsx('divide-y divide-gray-100', className)} {...props} />
}

// 4. Table Row
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={clsx(
        'hover:bg-gray-50/70 transition-colors [&:last-child]:border-0',
        className
      )}
      {...props}
    />
  )
}

// 5. Table Head Cell
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={clsx(
        'px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider',
        className
      )}
      {...props}
    />
  )
}

// 6. Table Cell
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx('px-3 py-1.5 text-gray-700 font-medium', className)} {...props} />
}
