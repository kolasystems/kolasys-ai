'use client'

// Kolasys AI — Recordings list page (glass redesign)

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Mic2, Clock, FileText, Search, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { StatusBadge, isStuck } from '@/components/status-badge'
import { RetryStuckButton } from '@/components/retry-stuck-button'
import { NewRecordingModal } from '@/components/new-recording-modal'
import { QuickVoiceUploadButton } from '@/components/quick-voice-upload-button'
import { MobileRecorder } from '@/components/mobile-recorder'
import { formatDuration, relativeTime } from '@/lib/utils'

const TERMINAL = ['READY', 'FAILED']

export default function RecordingsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [rawQuery, setRawQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // 500 ms debounce, cleared when the input is blanked.
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(rawQuery.trim()), 500)
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

  // Semantic search across all indexed transcripts (pgvector). Falls back to
  // a title + transcript contains filter server-side if no embeddings exist.
  const {
    data: searchData,
    isFetching: searchFetching,
  } = trpc.recordings.semanticSearch.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0, staleTime: 30_000 },
  )

  const recordings = data?.pages.flatMap((p) => p.items) ?? []
  const isSearching = searchQuery.length > 0
  const searchResults = searchData?.results ?? []
  const searchMode = searchData?.mode ?? 'text'

  if (error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center sm:p-16">
        <Mic2 className="mb-3 h-10 w-10 text-muted" />
        <p className="text-sm font-semibold text-primary">No workspace selected</p>
        <p className="mt-1 text-xs text-secondary">
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
          <h1 className="text-xl font-bold text-primary sm:text-2xl">Meetings</h1>
          <p className="mt-0.5 text-sm text-secondary">
            All your meetings in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuickVoiceUploadButton />
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-md shadow-[color:var(--accent)]/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <Plus className="h-4 w-4" />
            New Recording
          </button>
        </div>
      </div>

      {/* Search bar — submit-on-Enter + 500ms debounce */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSearchQuery(rawQuery.trim())
        }}
        className="relative mt-4 sm:mt-5"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          placeholder="Search meanings, not just titles — press Enter"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          className="glass min-h-[44px] w-full py-2.5 pl-9 pr-9 text-sm text-primary placeholder:text-muted focus:outline-none"
        />
        {rawQuery && (
          <button
            type="button"
            onClick={() => { setRawQuery(''); setSearchQuery('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-secondary"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* List / Search results */}
      <div className="mt-4">
        {isSearching ? (
          searchFetching && !searchData ? (
            <>
              <p className="mb-3 text-xs text-secondary">
                Searching across transcripts for &ldquo;{searchQuery}&rdquo;…
              </p>
              <ul className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="skeleton h-20" />
                ))}
              </ul>
            </>
          ) : searchResults.length === 0 ? (
            <div className="glass flex flex-col items-center justify-center py-12 text-center">
              <Search className="mb-3 h-8 w-8 text-muted" />
              <p className="text-sm font-medium text-secondary">
                No results for &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => { setRawQuery(''); setSearchQuery('') }}
                className="mt-3 text-xs font-medium text-accent hover:opacity-80"
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-secondary">
                <p>
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                  {searchMode === 'text' && (
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-600 dark:bg-white/10 dark:text-gray-300">
                      Text match
                    </span>
                  )}
                  {searchMode === 'semantic' && (
                    <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                      Semantic
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => { setRawQuery(''); setSearchQuery('') }}
                  className="font-medium text-accent hover:opacity-80"
                >
                  Clear search
                </button>
              </div>
              <ul className="space-y-2">
                {searchResults.map((r) => (
                  <SearchResultRow key={r.recordingId} result={r} query={searchQuery} />
                ))}
              </ul>
            </>
          )
        ) : isLoading ? (
          <ul className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="skeleton h-16" />
            ))}
          </ul>
        ) : recordings.length === 0 ? (
          <div className="glass flex flex-col items-center justify-center py-16 text-center">
            <Mic2 className="mb-3 h-10 w-10 text-muted" />
            <p className="text-sm font-medium text-secondary">No recordings yet</p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
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
                className="glass lift-on-hover mt-4 min-h-[44px] w-full py-2.5 text-sm font-medium text-secondary disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>

      <NewRecordingModal open={modalOpen} onOpenChange={setModalOpen} />
      <MobileRecorder />
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

// ── Semantic search result row ───────────────────────────────────────────

type SearchResult = {
  recordingId: string
  title: string
  createdAt: Date
  snippet: string
  score: number
}

function SearchResultRow({ result, query }: { result: SearchResult; query: string }) {
  // Highlight matches inside the snippet. Case-insensitive, escaped for regex.
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'gi')
  const parts = result.snippet.split(re)

  // Score is a cosine similarity (0..1) from pgvector; text fallback reports 0.
  const scorePct = Math.round(result.score * 100)

  return (
    <li>
      <Link
        href={`/dashboard/recordings/${result.recordingId}`}
        className="glass lift-on-hover group flex flex-col gap-2 px-4 py-3 sm:px-5"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">
            {result.title}
          </p>
          <div className="flex flex-shrink-0 items-center gap-2 text-xs text-secondary">
            {result.score > 0 && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-accent">
                {scorePct}% match
              </span>
            )}
            <span>{relativeTime(result.createdAt)}</span>
          </div>
        </div>

        {result.snippet && (
          <p className="line-clamp-2 text-xs leading-relaxed text-secondary">
            {parts.map((p, i) =>
              re.test(p) ? (
                <mark
                  key={i}
                  className="rounded bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] px-0.5 text-primary"
                >
                  {p}
                </mark>
              ) : (
                <span key={i}>{p}</span>
              ),
            )}
          </p>
        )}
      </Link>
    </li>
  )
}

function RecordingRow({ r }: { r: RowRecording }) {
  const stuck = isStuck(
    r.status as Parameters<typeof isStuck>[0],
    r.createdAt,
  )
  return (
    <li className="relative">
      <Link
        href={`/dashboard/recordings/${r.id}`}
        className="glass lift-on-hover group flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
      >
        {/* Icon */}
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--accent)_28%,transparent)]">
          <Mic2 className="h-4 w-4 text-accent" />
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-primary sm:truncate">{r.title}</p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
            <StatusBadge
              status={r.status as Parameters<typeof StatusBadge>[0]['status']}
              createdAt={r.createdAt}
            />
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
      {stuck && (
        // Sits over the row's right edge so the click never reaches the
        // outer Link. RetryStuckButton renders its own <button>.
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2"
          onClickCapture={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
        >
          <RetryStuckButton recordingId={r.id} size="sm" />
        </div>
      )}
    </li>
  )
}
