// Kolasys AI — Recording status badge

import { cn } from '@/lib/utils'

type RecordingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'TRANSCRIBING'
  | 'SUMMARIZING'
  | 'READY'
  | 'FAILED'

const statusConfig: Record<RecordingStatus, { label: string; className: string }> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  TRANSCRIBING: {
    label: 'Transcribing',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  SUMMARIZING: {
    label: 'Summarizing',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
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

const STUCK_CLASSNAME = 'bg-amber-100 text-amber-800 border-amber-300'
const IN_PROGRESS: ReadonlySet<RecordingStatus> = new Set([
  'PENDING',
  'PROCESSING',
  'TRANSCRIBING',
  'SUMMARIZING',
])
const STUCK_THRESHOLD_MS = 30 * 60_000

export function isStuck(status: RecordingStatus, createdAt: Date | string): boolean {
  if (!IN_PROGRESS.has(status)) return false
  const age = Date.now() - new Date(createdAt).getTime()
  return age > STUCK_THRESHOLD_MS
}

/** Humanise how long a recording has been stuck, e.g. "2 hours", "3 days". */
export function formatStuckAge(createdAt: Date | string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

type Props = {
  status: RecordingStatus
  className?: string
  /** When provided, the badge flips to a "Stuck" amber variant for any
   *  in-progress status older than 30 minutes. */
  createdAt?: Date | string | null
}

export function StatusBadge({ status, className, createdAt }: Props) {
  const stuck = createdAt ? isStuck(status, createdAt) : false
  const config = statusConfig[status] ?? statusConfig.PROCESSING

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        stuck ? STUCK_CLASSNAME : config.className,
        className,
      )}
    >
      {!stuck && ['PROCESSING', 'TRANSCRIBING', 'SUMMARIZING'].includes(status) && (
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-70" />
      )}
      {stuck ? (
        <>
          <span aria-hidden className="mr-1">
            ⚠
          </span>
          Stuck
        </>
      ) : (
        config.label
      )}
    </span>
  )
}
