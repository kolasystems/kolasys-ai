'use client'

// Kolasys AI — Per-user summary email toggle on /dashboard/settings.
// Controls OrgMember.emailSummaryOnReady (per-user, overrides org postMeetingEmail).

import { useState } from 'react'
import { Loader2, Mail, MailX } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Props = {
  initialEnabled: boolean
}

export function EmailSummaryOnReadyToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const mutation = trpc.settings.updateEmailSummaryOnReady.useMutation({
    onSuccess: (data) => {
      setEnabled(data.emailSummaryOnReady)
      setFeedback({
        type: 'success',
        message: data.emailSummaryOnReady
          ? 'Email notifications enabled for your account.'
          : 'Meeting notes emails turned off for your account.',
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
    mutation.mutate({ enabled: next })
  }

  const busy = mutation.isPending

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        {enabled ? (
          <Mail className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
        ) : (
          <MailX className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
        )}
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Personal meeting notes email
        </h2>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              Email me meeting notes when a recording is ready
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
              Sends you a personal email with the summary, action items, and a link to the full
              notes. Only applies to your own recordings. The workspace-level toggle must also be on.
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
