'use client'

// Kolasys AI — Auto-record meetings toggle on /dashboard/settings.
// Controls Organization.autoRecordMeetings. When ON, the calendar-bot
// Railway worker auto-deploys a Recall.ai bot to upcoming Google /
// Microsoft calendar meetings 4–6 minutes before they start.

import { useState } from 'react'
import { Loader2, Calendar } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Props = {
  initialAutoRecordMeetings: boolean
}

export function AutoRecordMeetingsToggle({ initialAutoRecordMeetings }: Props) {
  const [enabled, setEnabled] = useState(initialAutoRecordMeetings)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const mutation = trpc.settings.updateOrgSettings.useMutation({
    onSuccess: (data) => {
      setEnabled(data.autoRecordMeetings)
      setFeedback({
        type: 'success',
        message: data.autoRecordMeetings
          ? 'Calendar meetings will be recorded automatically.'
          : 'Automatic calendar recording disabled.',
      })
    },
    onError: (e) => {
      setEnabled((v) => !v) // roll back optimistic
      setFeedback({ type: 'error', message: e.message })
    },
  })

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    setFeedback(null)
    mutation.mutate({ autoRecordMeetings: next })
  }

  const busy = mutation.isPending

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <Calendar className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Auto-record meetings
        </h2>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              Automatically record meetings
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
              Kolasys AI will automatically join and record calendar meetings with video
              links (Zoom, Google Meet, Microsoft Teams). The bot joins 4–6 minutes before
              each meeting starts. Requires a connected Google or Microsoft calendar in
              the Calendar tab.
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
              enabled ? 'bg-brand-600' : 'bg-neutral-300 dark:bg-white/15',
            )}
            style={enabled ? { background: '#CA2625' } : undefined}
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
