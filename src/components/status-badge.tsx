// Kolasys AI — Recording status badge

import { cn } from '@/lib/utils'

type RecordingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'

const statusConfig: Record<
  RecordingStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  READY: {
    label: 'Ready',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
}

type Props = {
  status: RecordingStatus
  className?: string
}

export function StatusBadge({ status, className }: Props) {
  const config = statusConfig[status]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {status === 'PROCESSING' && (
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
      )}
      {config.label}
    </span>
  )
}
