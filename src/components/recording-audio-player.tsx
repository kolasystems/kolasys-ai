'use client'

// Kolasys AI — Sticky web audio player for the recording detail right pane.
// Fetches a pre-signed S3 URL via trpc.recordings.getAudioUrl and plays it
// with a compact custom transport (play/pause + tap-to-seek scrubber + clock).

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Loader2, VolumeX } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatDuration } from '@/lib/utils'

type Props = {
  recordingId: string
}

export function RecordingAudioPlayer({ recordingId }: Props) {
  const { data, isLoading, refetch } = trpc.recordings.getAudioUrl.useQuery(
    { recordingId },
    { retry: false, staleTime: 50 * 60_000 }, // 50 min — the URL itself is valid 60 min
  )

  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [barWidth, setBarWidth] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)
  const retriedRef = useRef(false)

  const url = data?.url ?? null

  // Keep barWidth in sync with layout.
  useEffect(() => {
    if (!barRef.current) return
    const el = barRef.current
    const update = () => setBarWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])

  // Reset play state when the URL changes.
  useEffect(() => {
    setPlaying(false)
    setPosition(0)
  }, [url])

  async function togglePlay() {
    const a = audioRef.current
    if (!a) return
    try {
      if (a.paused) {
        await a.play()
        setPlaying(true)
      } else {
        a.pause()
        setPlaying(false)
      }
    } catch {
      // Probably expired URL — refetch once.
      if (!retriedRef.current) {
        retriedRef.current = true
        await refetch()
      }
    }
  }

  function handleBarClick(clientX: number) {
    const bar = barRef.current
    const a = audioRef.current
    if (!bar || !a || duration === 0) return
    const rect = bar.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    a.currentTime = frac * duration
    setPosition(a.currentTime)
  }

  // Loading state — skeleton bar.
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 border-t border-line bg-surface/50 px-4 py-3 dark:border-white/10 dark:bg-[#1A1A24]/60">
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
        <span className="text-xs text-muted">Loading audio…</span>
      </div>
    )
  }

  // Unavailable — audio purged after transcription.
  if (!url) {
    return (
      <div className="flex items-center gap-2 border-t border-line bg-surface/50 px-4 py-3 text-xs text-muted dark:border-white/10 dark:bg-[#1A1A24]/60">
        <VolumeX className="h-3.5 w-3.5" />
        Audio unavailable — deleted after transcription
      </div>
    )
  }

  const progress = duration > 0 ? Math.min(1, position / duration) : 0

  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface/80 px-4 py-3 backdrop-blur-sm dark:border-white/10 dark:bg-[#1A1A24]/80">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false)
          setPosition(0)
        }}
        onError={async () => {
          // URL may have expired — refetch and retry once.
          if (!retriedRef.current) {
            retriedRef.current = true
            await refetch()
          }
        }}
      />

      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={playing ? 'Pause audio' : 'Play audio'}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white shadow transition-transform hover:scale-105 active:scale-95"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <span className="font-mono text-xs tabular-nums text-muted" style={{ minWidth: 40 }}>
        {formatDuration(Math.floor(position))}
      </span>

      {/* Scrubber — tap anywhere on the bar to seek */}
      <div
        ref={barRef}
        className="relative h-1 flex-1 cursor-pointer rounded-full bg-neutral-200 dark:bg-white/10"
        onMouseDown={(e) => handleBarClick(e.clientX)}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow"
          style={{ left: `${progress * 100}%`, display: barWidth ? undefined : 'none' }}
        />
      </div>

      <span className="font-mono text-xs tabular-nums text-muted" style={{ minWidth: 40 }}>
        {duration > 0 ? formatDuration(Math.floor(duration)) : '—'}
      </span>
    </div>
  )
}
