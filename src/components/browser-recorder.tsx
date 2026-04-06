'use client'

// Kolasys AI — Browser-based audio recorder using the MediaRecorder API.
// Uses a Web Audio AnalyserNode for a real waveform visualiser.

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Square, Upload } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'

type RecorderState = 'idle' | 'recording' | 'stopped'

const NUM_BARS = 20
const INITIAL_BARS = Array<number>(NUM_BARS).fill(4)

type Props = {
  onRecordingComplete: (blob: Blob, mimeType: string) => void
  className?: string
}

export function BrowserRecorder({ onRecordingComplete, className }: Props) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [barHeights, setBarHeights] = useState<number[]>(INITIAL_BARS)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordedBlobRef = useRef<{ blob: Blob; mimeType: string } | null>(null)

  // Web Audio refs — AnalyserNode drives the real waveform.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Cancel animation frame on unmount.
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  function startWaveform(stream: MediaStream) {
    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 64 // 32 frequency bins
    analyser.smoothingTimeConstant = 0.75

    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)

    audioCtxRef.current = audioCtx
    analyserRef.current = analyser

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    function draw() {
      if (!analyserRef.current) return
      analyserRef.current.getByteFrequencyData(dataArray)

      const bars = Array.from({ length: NUM_BARS }, (_, i) => {
        // Map each bar to a frequency bin, biased toward lower bins where voice sits.
        const binIndex = Math.floor((i / NUM_BARS) * (dataArray.length * 0.6))
        const value = dataArray[binIndex] ?? 0
        // Scale to 4–36 px range.
        return 4 + (value / 255) * 32
      })

      setBarHeights(bars)
      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()
  }

  function stopWaveform() {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    setBarHeights(INITIAL_BARS)
  }

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
        // Store blob — upload is triggered only when user clicks "Use This Recording".
        recordedBlobRef.current = { blob, mimeType }
        streamRef.current?.getTracks().forEach((t) => t.stop())
      }

      recorder.start(1_000)
      startWaveform(stream)
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
    stopWaveform()
    setState('stopped')
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setElapsed(0)
    setError(null)
    chunksRef.current = []
    recordedBlobRef.current = null
    setBarHeights(INITIAL_BARS)
  }, [])

  const handleUseRecording = useCallback(() => {
    if (!recordedBlobRef.current) return
    onRecordingComplete(recordedBlobRef.current.blob, recordedBlobRef.current.mimeType)
  }, [onRecordingComplete])

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Waveform visualiser */}
      <div
        className={cn(
          'flex h-20 w-full items-center justify-center gap-0.5 rounded-xl border-2 bg-neutral-50 px-4 transition-colors',
          state === 'recording' ? 'border-red-400 bg-red-50' : 'border-neutral-200'
        )}
      >
        {state === 'recording' ? (
          barHeights.map((h, i) => (
            <span
              key={i}
              className="inline-block w-1 flex-shrink-0 rounded-full bg-red-500 transition-all duration-75"
              style={{ height: `${h}px` }}
            />
          ))
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
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Mic className="h-4 w-4" />
            Start Recording
          </button>
        )}

        {state === 'recording' && (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
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
              className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-50"
            >
              <MicOff className="h-4 w-4" />
              Re-record
            </button>
            <button
              type="button"
              onClick={handleUseRecording}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              <Upload className="h-4 w-4" />
              Use This Recording
            </button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
