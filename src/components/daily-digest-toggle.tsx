'use client'

// Kolasys AI — Daily digest toggle on /dashboard/settings.
// Controls Organization.dailyDigest (default true).

import { useState } from 'react'
import { Coffee, Loader2, CoffeeIcon } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Props = {
  initialDailyDigest: boolean
}

export function DailyDigestToggle({ initialDailyDigest }: Props) {
  const [enabled, setEnabled] = useState(initialDailyDigest)
  const [feedback, setFeedback] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null)

  const mutation = trpc.settings.updateOrgSettings.useMutation({
    onSuccess: (data) => {
      setEnabled(data.dailyDigest)
      setFeedback({
        type: 'success',
        message: data.dailyDigest
          ? 'Daily digest enabled — you’ll receive one at 8 AM.'
          : 'Daily digest disabled for this workspace.',
      })
    },
    onError: (e) => {
      setEnabled((v) => !v) // rollback optimistic
      setFeedback({ type: 'error', message: e.message })
    },
  })

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    setFeedback(null)
    mutation.mutate({ dailyDigest: next })
  }

  const busy = mutation.isPending
  const Icon = enabled ? Coffee : CoffeeIcon

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <Icon className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Daily digest
        </h2>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              Morning digest at 8 AM
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
              Every morning, the workspace owner gets a recap email of yesterday’s meetings
              — summaries plus any open action items. Turn off to stop the daily cron for
              this workspace.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={busy}
            className={cn(
              'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60',
              enabled ? 'bg-accent' : 'bg-neutral-300 dark:bg-white/15',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
            {busy && (
              <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
            )}
          </button>
        </div>

        {feedback && (
          <p
            className={cn(
              'rounded-lg px-3 py-2 text-xs',
              feedback.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200'
                : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
            )}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </section>
  )
}
