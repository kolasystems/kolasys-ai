'use client'

// Kolasys AI — Recordings list page

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Mic2, Clock, FileText } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { StatusBadge } from '@/components/status-badge'
import { NewRecordingModal } from '@/components/new-recording-modal'
import { formatDuration, relativeTime } from '@/lib/utils'

export default function RecordingsPage() {
  const [modalOpen, setModalOpen] = useState(false)

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.recordings.list.useInfiniteQuery(
      { limit: 20 },
      { getNextPageParam: (last) => last.nextCursor, retry: false }
    )

  const recordings = data?.pages.flatMap((p) => p.items) ?? []

  // FORBIDDEN means no active org — layout should have caught this, but
  // handle it here too in case of a mid-session org switch.
  if (error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <Mic2 className="mb-3 h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-neutral-700">No workspace selected</p>
        <p className="mt-1 text-xs text-neutral-500">
          Switch to a workspace using the selector in the sidebar, or create a new one.
        </p>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Recordings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            All your meeting recordings in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Recording
        </button>
      </div>

      {/* List */}
      <div className="mt-6">
        {isLoading ? (
          <ul className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="h-16 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100"
              />
            ))}
          </ul>
        ) : recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 text-center">
            <Mic2 className="mb-3 h-10 w-10 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-500">No recordings yet</p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Recording
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {recordings.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/recordings/${r.id}`}
                    className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <Mic2 className="h-5 w-5 text-brand-500" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {r.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-neutral-500">
                        {r.duration !== null && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(r.duration)}
                          </span>
                        )}
                        {r._count.notes > 0 && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {r._count.notes} note{r._count.notes !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span>{relativeTime(r.createdAt)}</span>
                      </div>
                    </div>

                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>

            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 w-full rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>

      <NewRecordingModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  )
}
