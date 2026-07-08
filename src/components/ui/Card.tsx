import React from 'react'
import clsx from 'clsx'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export default function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white border border-gray-150/60 rounded-2xl shadow-subtle p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ease-in-out',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
