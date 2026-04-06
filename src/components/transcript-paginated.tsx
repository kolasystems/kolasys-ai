'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatDuration } from '@/lib/utils'

type Segment = {
  id: string
  startTime: number
  endTime: number
  speaker: string | null
  text: string
}

type Props = {
  transcriptId: string
  initialSegments: Segment[]
  initialHasMore: boolean
  fullText: string
}

export function TranscriptPaginated({
  transcriptId,
  initialSegments,
  initialHasMore,
  fullText,
}: Props) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments)
  const [cursor, setCursor] = useState<string | undefined>(
    initialHasMore ? initialSegments.at(-1)?.id : undefined
  )
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  const utils = trpc.useUtils()

  async function loadMore() {
    if (!cursor || loading) return
    setLoading(true)
    try {
      const result = await utils.recordings.listTranscriptSegments.fetch({
        transcriptId,
        cursor,
        limit: 100,
      })
      setSegments((prev) => [...prev, ...result.segments])
      setHasMore(!!result.nextCursor)
      setCursor(result.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  if (segments.length === 0) {
    return <p className="text-sm leading-relaxed text-neutral-600">{fullText}</p>
  }

  return (
    <div>
      <div className="space-y-4">
        {segments.map((seg) => (
          <div key={seg.id} className="flex gap-3">
            <span className="mt-0.5 w-14 flex-shrink-0 font-mono text-xs text-neutral-400">
              {formatDuration(seg.startTime)}
            </span>
            <div className="min-w-0">
              {seg.speaker && (
                <p className="mb-0.5 text-xs font-semibold text-brand-600">{seg.speaker}</p>
              )}
              <p className="text-sm leading-relaxed text-neutral-700">{seg.text}</p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </>
          ) : (
            'Load more'
          )}
        </button>
      )}
    </div>
  )
}
