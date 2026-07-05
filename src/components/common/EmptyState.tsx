import React from 'react'
import { Inbox } from 'lucide-react'
import Button from '../ui/Button'

interface EmptyStateProps {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: React.ReactNode
}

export default function EmptyState({
  title = 'No records found',
  description = 'Add a new record to get started.',
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded text-center select-none bg-white/50">
      {icon ? (
        <div className="text-gray-400 mb-3">{icon}</div>
      ) : (
        <Inbox className="h-8 w-8 text-gray-300 mb-3 shrink-0" />
      )}
      <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
      <p className="text-[11px] text-gray-400 mt-1 max-w-[280px]">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline" size="sm" className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
