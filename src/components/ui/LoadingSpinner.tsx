import clsx from 'clsx'

interface LoadingSpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center p-4 select-none">
      <div
        className={clsx(
          'animate-spin rounded-full border-b-2 border-blue-500',
          {
            'h-4 w-4': size === 'sm',
            'h-6 w-6': size === 'md',
            'h-10 w-10': size === 'lg',
          },
          className
        )}
      />
    </div>
  )
}
