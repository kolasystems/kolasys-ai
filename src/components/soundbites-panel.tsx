'use client'

// Kolasys AI — Soundbites tab panel for the recording detail. Lists every
// soundbite captured against this recording with a duration pill, a
// transcript excerpt, and a delete button.

import { ArrowRight, Lightbulb, Scissors, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

function fmtSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

type Props = {
  recordingId: string
  /** When provided, renders a "Switch to transcript" CTA so the user can
   *  capture more soundbites without hunting for the right tab. */
  onOpenTranscript?: () => void
}

export function SoundbitesPanel({ recordingId, onOpenTranscript }: Props) {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.soundbites.list.useQuery({ recordingId })
  const deleteSoundbite = trpc.soundbites.delete.useMutation({
    onSuccess: () => utils.soundbites.list.invalidate(),
  })

  // Always-visible nudge — the "Create soundbite" button only appears in
  // the transcript view, so people landing here need a clear bridge over.
  const Hint = onOpenTranscript ? (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#CA2625]/15 bg-[#CA2625]/5 px-3 py-2.5">
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#CA2625]" />
      <div className="flex-1 text-xs text-neutral-700 dark:text-gray-300">
        Switch to the Transcript tab, select any text, then tap{' '}
        <span className="font-semibold text-[#CA2625]">Create soundbite</span>{' '}
        to clip a moment.
      </div>
      <button
        type="button"
        onClick={onOpenTranscript}
        className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-[#CA2625] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#b21f1f]"
      >
        Open transcript
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  ) : null

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
        {Hint}
        <p className="text-xs text-muted">Loading soundbites…</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
        {Hint}
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <Scissors className="mb-3 h-10 w-10 text-muted" />
          <p className="text-sm font-medium text-secondary">No soundbites yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted">
            Highlight a passage in the transcript and tap{' '}
            <span className="font-semibold text-[#CA2625]">Create soundbite</span>{' '}
            to clip a memorable moment.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
      {Hint}
      <ul className="space-y-3">
        {data.map((b) => {
          const duration = Math.max(0, b.endSeconds - b.startSeconds)
          return (
            <li
              key={b.id}
              className="rounded-xl border border-line bg-white p-3.5 shadow-sm dark:bg-[#1A1A24] dark:border-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">{b.title}</p>
                  <p className="mt-0.5 text-[11px] text-secondary">
                    {fmtSeconds(b.startSeconds)} – {fmtSeconds(b.endSeconds)}
                    <span className="mx-1.5 text-muted">·</span>
                    <span className="text-muted">
                      {duration < 1
                        ? '<1s'
                        : duration < 60
                          ? `${Math.round(duration)}s`
                          : fmtSeconds(duration)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete this soundbite?')) {
                      deleteSoundbite.mutate({ id: b.id })
                    }
                  }}
                  className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {b.transcript && (
                <p className="mt-2 line-clamp-3 rounded-md bg-neutral-50 p-2 text-xs italic text-neutral-700 dark:bg-white/5 dark:text-gray-300">
                  &ldquo;{b.transcript}&rdquo;
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
