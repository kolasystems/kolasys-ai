'use client'

import { useState } from 'react'
import { Loader2, Play, SkipBack, SkipForward } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatDuration } from '@/lib/utils'
import { SpeakerLabelEditor } from './speaker-label-editor'
import { cn } from '@/lib/utils'

type Segment = {
  id: string
  startTime: number
  endTime: number
  speaker: string | null
  text: string
  // JSON-encoded Array<{ word: string; start: number; end: number }> when the
  // segment has word-level timestamps. Null on legacy segments — they fall
  // back to plain text rendering.
  wordsJson?: string | null
}

type WordToken = { word: string; start: number; end: number }

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
  duration?: number | null
  /** Called with the target timestamp (seconds) when the user clicks a word. */
  onSeek?: (seconds: number) => void
  /** Current audio playhead in seconds — used to highlight the spoken word. */
  playhead?: number
}

// Defensive JSON parse for wordsJson — avoids throwing on malformed DB rows.
function parseWords(json: string | null | undefined): WordToken[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (w): w is WordToken =>
        w &&
        typeof w === 'object' &&
        typeof (w as WordToken).word === 'string' &&
        typeof (w as WordToken).start === 'number' &&
        typeof (w as WordToken).end === 'number',
    )
  } catch {
    return []
  }
}

// ─── Pre-seeded waveform heights (stable across renders) ─────────────────────
const WAVEFORM_HEIGHTS = [
  0.4,0.6,0.3,0.7,0.5,0.8,0.4,0.9,0.6,0.3,
  0.7,0.5,0.4,0.8,0.6,0.3,0.7,0.9,0.4,0.5,
  0.6,0.8,0.3,0.5,0.7,0.9,0.4,0.6,0.3,0.8,
  0.5,0.7,0.4,0.9,0.6,0.3,0.7,0.5,0.4,0.8,
  0.6,0.9,0.3,0.5,0.7,0.4,0.6,0.8,0.3,0.5,
]

// ─── Speaker colours ──────────────────────────────────────────────────────────
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

// ─── Topic outline ────────────────────────────────────────────────────────────

interface TopicEntry {
  title: string
  timestamp: number
  segmentId: string
}

function buildOutline(segments: Segment[]): TopicEntry[] {
  if (segments.length < 3) return []
  const topics: TopicEntry[] = []
  let lastTopicTime = -120

  segments.forEach((seg, i) => {
    const isFirst = i === 0
    const bigGap = seg.startTime - lastTopicTime > 90
    const everyN = i > 0 && i % 12 === 0

    if (isFirst || bigGap || everyN) {
      const sentence = seg.text.split(/[.!?]/)[0].trim()
      const title =
        sentence.length > 65 ? sentence.slice(0, 62) + '…' : sentence || `Section ${topics.length + 1}`
      topics.push({ title, timestamp: seg.startTime, segmentId: seg.id })
      lastTopicTime = seg.startTime
    }
  })

  return topics.length >= 2 ? topics : []
}

function TopicOutline({ topics }: { topics: TopicEntry[] }) {
  if (!topics.length) return null

  function scrollTo(segmentId: string) {
    document.getElementById(`seg-${segmentId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  return (
    <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Outline
      </p>
      <ul className="space-y-0.5">
        {topics.map((t, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => scrollTo(t.segmentId)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white hover:shadow-sm min-h-[44px]"
            >
              <span className="w-12 flex-shrink-0 font-mono text-xs font-semibold text-brand-500">
                {formatDuration(t.timestamp)}
              </span>
              <span className="flex-1 truncate text-sm text-neutral-700">{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Audio player UI (visual only — audio deleted after transcription) ────────

function AudioPlayerUI({ duration }: { duration?: number | null }) {
  const [attempted, setAttempted] = useState(false)

  return (
    <div className="mb-5 rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
      {/* Waveform bars */}
      <div className="mb-3 flex h-9 items-center gap-px" aria-hidden>
        {WAVEFORM_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-brand-200"
            style={{ height: `${Math.max(4, h * 36)}px` }}
          />
        ))}
      </div>

      {/* Duration + deleted note */}
      <div className="mb-3 flex items-center justify-between gap-2">
        {duration != null && (
          <span className="font-mono text-sm font-semibold text-neutral-700">
            {formatDuration(duration)}
          </span>
        )}
        <span className="ml-auto text-xs text-neutral-400 text-right">
          Audio deleted after transcription
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setAttempted(true)}
          className="flex h-11 w-11 items-center justify-center gap-0.5 rounded-full border border-neutral-200 text-neutral-400 transition-colors hover:bg-neutral-50"
          title="Seek back 15 seconds (unavailable)"
          aria-label="Seek back 15 seconds"
        >
          <SkipBack className="h-4 w-4" />
          <span className="text-[10px] font-bold leading-none">15</span>
        </button>

        <button
          type="button"
          onClick={() => setAttempted(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition-colors hover:bg-brand-700"
          title="Play (unavailable)"
          aria-label="Play"
        >
          <Play className="h-5 w-5 translate-x-0.5" />
        </button>

        <button
          type="button"
          onClick={() => setAttempted(true)}
          className="flex h-11 w-11 items-center justify-center gap-0.5 rounded-full border border-neutral-200 text-neutral-400 transition-colors hover:bg-neutral-50"
          title="Seek forward 15 seconds (unavailable)"
          aria-label="Seek forward 15 seconds"
        >
          <span className="text-[10px] font-bold leading-none">15</span>
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {attempted && (
        <p className="mt-2 text-center text-xs text-neutral-500">
          Audio is deleted after transcription to protect privacy.
          Read the transcript below.
        </p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TranscriptPaginated({
  transcriptId,
  recordingId,
  initialSegments,
  initialHasMore,
  fullText,
  speakerLabels,
  duration,
  onSeek,
  playhead,
}: Props) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments)
  const [cursor, setCursor] = useState<string | undefined>(
    initialHasMore ? initialSegments.at(-1)?.id : undefined,
  )
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  const labelMap = Object.fromEntries(speakerLabels.map((l) => [l.speakerId, l.displayName]))
  const utils = trpc.useUtils()
  const outline = buildOutline(segments)

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
    return (
      <>
        <AudioPlayerUI duration={duration} />
        <p className="text-sm leading-relaxed text-neutral-600">{fullText}</p>
      </>
    )
  }

  const uniqueSpeakers = [
    ...new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s)),
  ]

  return (
    <div>
      {/* Audio player */}
      <AudioPlayerUI duration={duration} />

      {/* Topic outline */}
      <TopicOutline topics={outline} />

      {/* Speaker legend */}
      {uniqueSpeakers.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {uniqueSpeakers.map((sid) => (
            <span
              key={sid}
              className={cn('flex items-center gap-1.5 text-xs font-medium', speakerColor(sid))}
            >
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

      {/* Segments */}
      <div className="space-y-4">
        {segments.map((seg) => {
          const displayName = seg.speaker ? (labelMap[seg.speaker] ?? seg.speaker) : null
          const color = seg.speaker ? speakerColor(seg.speaker) : null
          const words = parseWords(seg.wordsJson)
          const hasWords = words.length > 0

          return (
            <div key={seg.id} id={`seg-${seg.id}`} className="flex gap-3 scroll-mt-4">
              {/* Click the timestamp to seek to the start of the segment */}
              <button
                type="button"
                onClick={() => onSeek?.(seg.startTime)}
                disabled={!onSeek}
                className={cn(
                  'mt-0.5 w-14 flex-shrink-0 text-left font-mono text-xs text-neutral-400',
                  onSeek && 'cursor-pointer transition-colors hover:text-accent',
                )}
                aria-label={`Seek to ${formatDuration(seg.startTime)}`}
              >
                {formatDuration(seg.startTime)}
              </button>
              <div className="min-w-0">
                {displayName && (
                  <p className={cn('mb-0.5 text-xs font-semibold', color)}>{displayName}</p>
                )}
                {hasWords ? (
                  // Word-level click-to-seek. Whisper includes a leading space
                  // in each word token, so buttons sit flush without extra
                  // separators. `inline` display lets them wrap naturally.
                  <p className="text-sm leading-relaxed text-neutral-700">
                    {words.map((w, i) => {
                      const isActive =
                        typeof playhead === 'number' &&
                        playhead >= w.start &&
                        playhead < w.end
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onSeek?.(w.start)}
                          className={cn(
                            'inline rounded px-0.5 transition-colors',
                            onSeek && 'cursor-pointer hover:bg-accent/20',
                            isActive && 'bg-accent/20 font-medium text-accent',
                          )}
                        >
                          {w.word}
                        </button>
                      )
                    })}
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-neutral-700">{seg.text}</p>
                )}
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
          className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-50"
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
