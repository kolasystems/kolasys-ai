// Kolasys AI — Recording status badge (glowing dark-mode aware variants)

import { cn } from '@/lib/utils'

type RecordingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'TRANSCRIBING'
  | 'SUMMARIZING'
  | 'READY'
  | 'FAILED'

type Variant = {
  label: string
  // Base classes (light-mode colours) — always applied.
  base: string
  // Extra classes added in dark mode.
  dark: string
  // Named glow utility in globals.css — empty string = no glow.
  glow: '' | 'status-glow-ready' | 'status-glow-pending' | 'status-glow-failed'
}

const statusConfig: Record<RecordingStatus, Variant> = {
  PENDING: {
    label: 'Pending',
    base: 'bg-amber-100 text-amber-800 border-amber-200',
    dark: 'dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
    glow: 'status-glow-pending',
  },
  PROCESSING: {
    label: 'Processing',
    base: 'bg-blue-100 text-blue-800 border-blue-200',
    dark: 'dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30',
    glow: '',
  },
  TRANSCRIBING: {
    label: 'Transcribing',
    base: 'bg-blue-100 text-blue-800 border-blue-200',
    dark: 'dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30',
    glow: '',
  },
  SUMMARIZING: {
    label: 'Summarizing',
    base: 'bg-purple-100 text-purple-800 border-purple-200',
    dark: 'dark:bg-purple-500/15 dark:text-purple-200 dark:border-purple-500/30',
    glow: '',
  },
  READY: {
    label: 'Ready',
    base: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dark: 'dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30',
    glow: 'status-glow-ready',
  },
  FAILED: {
    label: 'Failed',
    base: 'bg-red-100 text-red-800 border-red-200',
    dark: 'dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30',
    glow: 'status-glow-failed',
  },
}

const STUCK_CLASSNAME =
  'bg-amber-100 text-amber-800 border-amber-300 ' +
  'dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40'

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
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200',
        stuck ? STUCK_CLASSNAME : `${config.base} ${config.dark}`,
        !stuck && config.glow,
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
