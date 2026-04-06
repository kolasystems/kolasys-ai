'use client'

// Kolasys AI — Browser-based audio/video recorder using the MediaRecorder API

import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, Square, Upload } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'

type RecorderState = 'idle' | 'recording' | 'stopped'

type Props = {
  onRecordingComplete: (blob: Blob, mimeType: string) => void
  className?: string
}

export function BrowserRecorder({ onRecordingComplete, className }: Props) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // FIX P0-2: store the finished blob in state so the user explicitly clicks
  // "Use This Recording" to trigger the upload, rather than firing on Stop.
  const recordedBlobRef = useRef<{ blob: Blob; mimeType: string } | null>(null)

  const startRecording = useCallback(async () => {
    setError(null)
    recordedBlobRef.current = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        // Store the blob — upload is triggered only when user clicks "Use This Recording".
        recordedBlobRef.current = { blob, mimeType }
        // Stop all tracks to release the microphone.
        streamRef.current?.getTracks().forEach((t) => t.stop())
      }

      recorder.start(1_000) // collect a chunk every second
      setState('recording')
      setElapsed(0)

      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access microphone.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setState('stopped')
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setElapsed(0)
    setError(null)
    chunksRef.current = []
    recordedBlobRef.current = null
  }, [])

  const handleUseRecording = useCallback(() => {
    if (!recordedBlobRef.current) return
    onRecordingComplete(recordedBlobRef.current.blob, recordedBlobRef.current.mimeType)
  }, [onRecordingComplete])

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Visualizer placeholder */}
      <div
        className={cn(
          'flex h-20 w-full items-center justify-center rounded-xl border-2 bg-neutral-50 transition-colors',
          state === 'recording'
            ? 'border-red-400 bg-red-50'
            : 'border-neutral-200'
        )}
      >
        {state === 'recording' ? (
          <div className="flex items-center gap-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                className="inline-block w-1 rounded-full bg-red-500 animate-pulse"
                style={{
                  height: `${8 + Math.random() * 28}px`,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            ))}
          </div>
        ) : (
          <Mic className="h-8 w-8 text-neutral-400" />
        )}
      </div>

      {/* Elapsed time */}
      {state === 'recording' && (
        <p className="font-mono text-lg font-semibold tabular-nums text-red-600">
          {formatDuration(elapsed)}
        </p>
      )}

      {state === 'stopped' && (
        <p className="text-sm text-neutral-500">
          Recording complete — {formatDuration(elapsed)} captured.
        </p>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {state === 'idle' && (
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Mic className="h-4 w-4" />
            Start Recording
          </button>
        )}

        {state === 'recording' && (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        )}

        {state === 'stopped' && (
          <>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 transition-colors"
            >
              <MicOff className="h-4 w-4" />
              Re-record
            </button>
            <button
              type="button"
              onClick={handleUseRecording}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Use This Recording
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
