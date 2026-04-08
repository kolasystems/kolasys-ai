'use client'

// Kolasys AI — Recordings list page

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Mic2, Clock, FileText, Search, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { StatusBadge } from '@/components/status-badge'
import { NewRecordingModal } from '@/components/new-recording-modal'
import { formatDuration, relativeTime } from '@/lib/utils'

const TERMINAL = ['READY', 'FAILED']

export default function RecordingsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [rawQuery, setRawQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(rawQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [rawQuery])

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.recordings.list.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (last) => last.nextCursor,
        retry: false,
        refetchInterval: (query) => {
          const items = query.state.data?.pages.flatMap((p) => p.items) ?? []
          return items.some((r) => !TERMINAL.includes(r.status)) ? 3000 : false
        },
      },
    )

  const { data: searchData, isFetching: searchFetching } = trpc.recordings.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 },
  )

  const recordings = data?.pages.flatMap((p) => p.items) ?? []
  const isSearching = searchQuery.length > 0
  const searchResults = searchData ?? []

  if (error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center sm:p-16">
        <Mic2 className="mb-3 h-10 w-10 text-neutral-300" />
        <p className="text-sm font-semibold text-neutral-700">No workspace selected</p>
        <p className="mt-1 text-xs text-neutral-500">
          Switch to a workspace using the selector in the sidebar, or create a new one.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">Recordings</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            All your meeting recordings in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Recording
        </button>
      </div>

      {/* Search bar */}
      <div className="relative mt-4 sm:mt-5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Search by title or transcript…"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {rawQuery && (
          <button
            type="button"
            onClick={() => { setRawQuery(''); setSearchQuery('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* List / Search results */}
      <div className="mt-4">
        {isSearching ? (
          searchFetching ? (
            <ul className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="h-16 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />
              ))}
            </ul>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-12 text-center">
              <Search className="mb-3 h-8 w-8 text-neutral-300" />
              <p className="text-sm font-medium text-neutral-500">
                No results for &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-neutral-500">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
              </p>
              <ul className="space-y-2">
                {searchResults.map((r) => (
                  <RecordingRow key={r.id} r={r} />
                ))}
              </ul>
            </>
          )
        ) : isLoading ? (
          <ul className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="h-16 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />
            ))}
          </ul>
        ) : recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 text-center">
            <Mic2 className="mb-3 h-10 w-10 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-500">No recordings yet</p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              New Recording
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {recordings.map((r) => (
                <RecordingRow key={r.id} r={r} />
              ))}
            </ul>

            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 min-h-[44px] w-full rounded-lg border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-50"
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

// ── Shared row component ──────────────────────────────────────────────────────

type RowRecording = {
  id: string
  title: string
  status: string
  duration: number | null
  createdAt: Date
  _count: { notes: number }
}

function RecordingRow({ r }: { r: RowRecording }) {
  return (
    <li>
      <Link
        href={`/dashboard/recordings/${r.id}`}
        className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:px-5"
      >
        {/* Icon */}
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Mic2 className="h-4 w-4 text-brand-500" />
        </div>

        {/* Title + meta — takes remaining width, allows wrapping */}
        <div className="min-w-0 flex-1">
          {/* Title: wraps on mobile so it's never truncated */}
          <p className="text-sm font-semibold leading-snug text-neutral-900 sm:truncate">{r.title}</p>

          {/* Second line: meta + status badge */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <StatusBadge status={r.status as Parameters<typeof StatusBadge>[0]['status']} />
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
      </Link>
    </li>
  )
}
