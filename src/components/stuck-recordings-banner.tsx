'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCw, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

export type StuckRecording = {
  id: string
  title: string
}

type Props = {
  recordings: StuckRecording[]
}

export function StuckRecordingsBanner({ recordings }: Props) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRetryingAll, setIsRetryingAll] = useState(false)

  const utils = trpc.useUtils()

  const retryMutation = trpc.recordings.retryStuck.useMutation()

  if (dismissed || recordings.length === 0) return null

  const count = recordings.length
  const label =
    count === 1
      ? '1 recording is stuck processing. It may have failed silently.'
      : `${count} recordings are stuck processing. They may have failed silently.`

  const handleRetryAll = async () => {
    setError(null)
    setIsRetryingAll(true)
    try {
      const results = await Promise.all(
        recordings.map((r) =>
          retryMutation.mutateAsync({ recordingId: r.id }).catch((err) => ({
            success: false as const,
            reason: err instanceof Error ? err.message : 'Retry failed',
          })),
        ),
      )
      const failures = results.filter((r) => !r.success)
      if (failures.length > 0) {
        setError(
          `${failures.length} of ${results.length} could not be retried. The audio may have been purged.`,
        )
      }
      await utils.recordings.getStuckRecordings.invalidate().catch(() => {})
      router.refresh()
    } finally {
      setIsRetryingAll(false)
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">{label}</p>
          <ul className="mt-1 text-sm text-amber-800">
            {recordings.slice(0, 3).map((r) => (
              <li key={r.id} className="truncate">
                <Link
                  href={`/dashboard/recordings/${r.id}`}
                  className="underline decoration-amber-400 underline-offset-2 hover:text-amber-900"
                >
                  {r.title}
                </Link>
              </li>
            ))}
            {count > 3 && (
              <li className="text-amber-700">and {count - 3} more…</li>
            )}
          </ul>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRetryAll}
              disabled={isRetryingAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-200 disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRetryingAll ? 'animate-spin' : ''}`} />
              {isRetryingAll ? 'Retrying…' : 'Retry All'}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
