'use client'

import { useRef, useState, useEffect } from 'react'
import { Mic, Square, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

// iOS Safari supports audio/mp4; Chrome/Firefox support audio/webm.
// Pick the first type the browser actually supports.
function detectMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

function extForMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

type State =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'recording'; elapsed: number }
  | { kind: 'uploading'; pct: number }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(blob)
  })
}

export function MobileRecorder() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [bgWarning, setBgWarning] = useState(true)

  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const utils = trpc.useUtils()
  const createRecording = trpc.recordings.create.useMutation()
  const getUploadUrl = trpc.recordings.getUploadUrl.useMutation()
  const confirmUpload = trpc.recordings.confirmUpload.useMutation()

  // Release resources on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      wakeLockRef.current?.release().catch(() => {})
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function startRecording() {
    setState({ kind: 'requesting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Keep screen on while recording — non-fatal if unsupported
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch { /* optional */ }

      const mimeType = detectMimeType()
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mrRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => void upload(mimeType)

      mr.start(1000) // emit chunks every second

      let elapsed = 0
      setState({ kind: 'recording', elapsed: 0 })
      timerRef.current = setInterval(() => {
        elapsed += 1
        setState({ kind: 'recording', elapsed })
      }, 1000)
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Microphone access denied.',
      })
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    wakeLockRef.current?.release().catch(() => {}); wakeLockRef.current = null
    mrRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
  }

  async function upload(mimeType: string) {
    const chunks = chunksRef.current
    if (!chunks.length) {
      setState({ kind: 'error', message: 'No audio captured.' })
      return
    }
    const effectiveMime = mimeType || 'audio/webm'
    const ext = extForMime(effectiveMime)
    const blob = new Blob(chunks, { type: effectiveMime })
    const title = `Voice memo — ${new Date().toLocaleString()}`

    setState({ kind: 'uploading', pct: 0 })
    try {
      const recording = await createRecording.mutateAsync({ title, source: 'UPLOAD' as const })
      const { url } = await getUploadUrl.mutateAsync({
        recordingId: recording.id,
        contentType: effectiveMime,
        extension: ext,
      })
      await putWithProgress(url, blob, effectiveMime, (pct) =>
        setState({ kind: 'uploading', pct })
      )
      await confirmUpload.mutateAsync({
        recordingId: recording.id,
        fileSize: blob.size,
        mimeType: effectiveMime,
      })
      await utils.recordings.list.invalidate()
      setState({ kind: 'done' })
      setTimeout(() => setState({ kind: 'idle' }), 2000)
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Upload failed.' })
    }
  }

  const isRecording = state.kind === 'recording'
  const isUploading = state.kind === 'uploading'
  const isBusy = state.kind === 'requesting' || isRecording || isUploading

  return (
    <>
      {/* Background audio warning — dismissable, only while recording */}
      {isRecording && bgWarning && (
        <div className="md:hidden fixed top-0 inset-x-0 z-50 flex items-center gap-2 bg-amber-500 px-4 py-2 text-xs font-medium text-white shadow-md">
          <span className="flex-1">
            Keep this tab open while recording — switch to the Kolasys iOS app for background recording.
          </span>
          <button
            onClick={() => setBgWarning(false)}
            className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Floating UI — hidden on md+ */}
      <div className="md:hidden fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">

        {/* Error toast */}
        {state.kind === 'error' && (
          <div className="flex max-w-[220px] items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 shadow-xl backdrop-blur">
            <span className="flex-1">{state.message}</span>
            <button onClick={() => setState({ kind: 'idle' })} aria-label="Dismiss">
              <X className="h-3 w-3 shrink-0" />
            </button>
          </div>
        )}

        {/* Success flash */}
        {state.kind === 'done' && (
          <div className="rounded-2xl bg-green-500/20 px-3 py-2 text-xs font-medium text-green-300 backdrop-blur shadow-xl">
            ✓ Uploaded — transcribing shortly
          </div>
        )}

        {/* Upload progress chip */}
        {isUploading && (
          <div className="w-44 rounded-2xl border border-white/10 bg-[#1A1A24]/95 px-4 py-2.5 shadow-xl backdrop-blur">
            <p className="mb-1.5 text-xs text-white/60">Uploading… {state.pct}%</p>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[#CA2625] transition-[width] duration-200"
                style={{ width: `${state.pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Recording timer chip */}
        {isRecording && (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1A1A24]/95 px-4 py-2.5 shadow-xl backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-sm font-semibold tabular-nums text-white">
              {formatTime(state.elapsed)}
            </span>
          </div>
        )}

        {/* Record / Stop button */}
        {!isUploading && state.kind !== 'done' && (
          isRecording ? (
            <button
              onClick={stopRecording}
              aria-label="Stop recording"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#1A1A24]/95 shadow-2xl backdrop-blur transition-transform active:scale-90"
            >
              <Square className="h-5 w-5 fill-red-500 text-red-500" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={isBusy}
              aria-label="Start recording"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#CA2625] shadow-2xl shadow-[#CA2625]/40 transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state.kind === 'requesting' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Mic className="h-6 w-6 text-white" />
              )}
            </button>
          )
        )}
      </div>
    </>
  )
}
