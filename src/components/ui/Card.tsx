import React from 'react'
import clsx from 'clsx'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export default function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white border border-gray-200 rounded shadow-subtle p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
