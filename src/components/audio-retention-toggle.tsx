'use client'

// Kolasys AI — Audio retention toggle on /dashboard/settings.
// Controls Organization.deleteAudioAfterTranscription.

import { useState } from 'react'
import { Loader2, AlertTriangle, Trash2, HardDrive } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Props = {
  initialDeleteAfterTranscription: boolean
}

export function AudioRetentionToggle({ initialDeleteAfterTranscription }: Props) {
  // true = auto-delete audio after transcription
  // false = keep audio (default)
  const [deleteAfter, setDeleteAfter] = useState(initialDeleteAfterTranscription)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const mutation = trpc.settings.updateOrgSettings.useMutation({
    onSuccess: (data) => {
      setDeleteAfter(data.deleteAudioAfterTranscription)
      setFeedback({
        type: 'success',
        message: data.deleteAudioAfterTranscription
          ? 'Audio will be deleted after transcription for new recordings.'
          : 'Audio will be retained for new recordings.',
      })
    },
    onError: (e) => {
      // Roll back the optimistic update on failure.
      setDeleteAfter((v) => !v)
      setFeedback({ type: 'error', message: e.message })
    },
  })

  function handleToggle() {
    const next = !deleteAfter
    setDeleteAfter(next) // optimistic
    setFeedback(null)
    mutation.mutate({ deleteAudioAfterTranscription: next })
  }

  const busy = mutation.isPending
  const retentionOn = !deleteAfter

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4">
        {retentionOn ? (
          <HardDrive className="h-4 w-4 text-neutral-500" />
        ) : (
          <Trash2 className="h-4 w-4 text-neutral-500" />
        )}
        <h2 className="text-sm font-semibold text-neutral-900">Audio retention</h2>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900">
              Auto-delete audio after transcription
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              When enabled, the original audio file is permanently deleted from S3 as soon as
              transcription completes. Recommended for strict privacy requirements (HIPAA, legal
              holds, etc.). When disabled, audio is retained so you can re-transcribe or play
              back the recording from the transcript view.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={deleteAfter}
            onClick={handleToggle}
            disabled={busy}
            className={cn(
              'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60',
              deleteAfter ? 'bg-red-500' : 'bg-neutral-300',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                deleteAfter ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
            {busy && (
              <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
            )}
          </button>
        </div>

        {/* Warning copy — shown only when retention is OFF (auto-delete ON) */}
        {deleteAfter && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              <span className="font-semibold">Audio deletion is permanent.</span> Once a recording
              finishes transcribing, its audio file is removed from storage and cannot be
              recovered. You will lose the ability to re-transcribe, play back, or export the
              audio for affected recordings. This setting only applies to <em>new</em> recordings
              — previously stored audio is unaffected.
            </p>
          </div>
        )}

        {feedback && (
          <p
            className={cn(
              'rounded-lg px-3 py-2 text-xs',
              feedback.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-800'
                : 'border border-red-200 bg-red-50 text-red-700',
            )}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </section>
  )
}
