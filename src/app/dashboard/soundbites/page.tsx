'use client'

// Kolasys AI — Global soundbites browser. Lists every clip captured
// across the org's recordings.

import Link from 'next/link'
import { Scissors, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

function fmtSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SoundbitesPage() {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.soundbites.list.useQuery({})
  const deleteSoundbite = trpc.soundbites.delete.useMutation({
    onSuccess: () => utils.soundbites.list.invalidate(),
  })

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex items-center gap-3">
        <Scissors className="h-5 w-5 text-[#CA2625]" />
        <div>
          <h1 className="text-xl font-bold text-primary sm:text-2xl">Soundbites</h1>
          <p className="mt-0.5 text-sm text-secondary">
            Every clip you&apos;ve captured across your recordings.
          </p>
        </div>
      </header>

      {isLoading && (
        <p className="text-sm text-secondary">Loading…</p>
      )}

      {!isLoading && data && data.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <Scissors className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="text-sm font-medium text-primary">No soundbites yet</p>
          <p className="mt-1 max-w-md mx-auto text-xs text-muted">
            Open any recording, switch to the transcript tab, highlight a passage,
            and tap{' '}
            <span className="font-semibold text-[#CA2625]">Create soundbite</span>.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((b) => {
            const duration = Math.max(0, b.endSeconds - b.startSeconds)
            return (
              <li
                key={b.id}
                className="rounded-xl border border-line bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/recordings/${b.recordingId}`}
                      className="text-[10px] font-medium uppercase tracking-wider text-secondary hover:text-accent"
                    >
                      {b.recording.title}
                    </Link>
                    <p className="mt-0.5 text-sm font-semibold text-primary">
                      {b.title}
                    </p>
                    <p className="mt-1 text-[11px] text-secondary">
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
                    <Trash2 className="h-3.5 w-3.5" />
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
      )}
    </div>
  )
}
