'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatDuration } from '@/lib/utils'
import { SpeakerLabelEditor } from './speaker-label-editor'

type Segment = {
  id: string
  startTime: number
  endTime: number
  speaker: string | null
  text: string
}

type SpeakerLabel = {
  speakerId: string
  displayName: string
}

type Props = {
  transcriptId: string
  recordingId: string
  initialSegments: Segment[]
  initialHasMore: boolean
  fullText: string
  speakerLabels: SpeakerLabel[]
}

// Distinct colors for up to 8 speakers
const SPEAKER_COLORS: Record<number, string> = {
  0: 'text-brand-600',
  1: 'text-purple-600',
  2: 'text-emerald-600',
  3: 'text-orange-600',
  4: 'text-pink-600',
  5: 'text-cyan-600',
  6: 'text-yellow-600',
  7: 'text-rose-600',
}

function speakerColor(speakerId: string): string {
  const num = parseInt(speakerId.replace(/\D/g, ''), 10) || 0
  return SPEAKER_COLORS[num % 8] ?? 'text-neutral-600'
}

export function TranscriptPaginated({
  transcriptId,
  recordingId,
  initialSegments,
  initialHasMore,
  fullText,
  speakerLabels,
}: Props) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments)
  const [cursor, setCursor] = useState<string | undefined>(
    initialHasMore ? initialSegments.at(-1)?.id : undefined
  )
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  // Build a display name map from speakerLabels
  const labelMap = Object.fromEntries(speakerLabels.map((l) => [l.speakerId, l.displayName]))

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

  // Detect unique speakers in the loaded segments
  const uniqueSpeakers = [
    ...new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s)),
  ]

  return (
    <div>
      {/* Speaker legend (if diarized) */}
      {uniqueSpeakers.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {uniqueSpeakers.map((sid) => (
            <span key={sid} className={`flex items-center gap-1.5 text-xs font-medium ${speakerColor(sid)}`}>
              <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
              <SpeakerLabelEditor
                recordingId={recordingId}
                speakerId={sid}
                displayName={labelMap[sid] ?? sid}
                className={speakerColor(sid)}
              />
            </span>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {segments.map((seg) => {
          const displayName = seg.speaker ? (labelMap[seg.speaker] ?? seg.speaker) : null
          const color = seg.speaker ? speakerColor(seg.speaker) : null

          return (
            <div key={seg.id} className="flex gap-3">
              <span className="mt-0.5 w-14 flex-shrink-0 font-mono text-xs text-neutral-400">
                {formatDuration(seg.startTime)}
              </span>
              <div className="min-w-0">
                {displayName && (
                  <p className={`mb-0.5 text-xs font-semibold ${color}`}>{displayName}</p>
                )}
                <p className="text-sm leading-relaxed text-neutral-700">{seg.text}</p>
              </div>
            </div>
          )
        })}
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
