'use client'

import { useRef, useState } from 'react'
import { Upload, CheckCircle, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

const ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac,.mp4,.caf,audio/x-m4a,audio/mp4'
const MAX_SIZE = 500 * 1024 * 1024

type UploadState =
  | { kind: 'idle' }
  | { kind: 'preparing'; fileName: string }
  | { kind: 'uploading'; fileName: string; pct: number }
  | { kind: 'finalizing'; fileName: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; fileName: string }

function defaultTitleFor(file: File): string {
  const stripped = file.name.replace(/\.[^.]+$/, '').trim()
  if (stripped) return stripped.slice(0, 200)
  return `Voice memo — ${new Date().toLocaleString()}`
}

function putWithProgress(
  url: string,
  file: File,
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
    xhr.send(file)
  })
}

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>({ kind: 'idle' })

  const utils = trpc.useUtils()
  const createRecording = trpc.recordings.create.useMutation()
  const getUploadUrl = trpc.recordings.getUploadUrl.useMutation()
  const confirmUpload = trpc.recordings.confirmUpload.useMutation()

  const inFlight =
    state.kind === 'preparing' ||
    state.kind === 'uploading' ||
    state.kind === 'finalizing'

  async function handleFile(file: File) {
    if (file.size > MAX_SIZE) {
      setState({ kind: 'error', message: 'File too large (max 500 MB).' })
      return
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'
    const contentType = file.type || `audio/${ext}`
    const title = defaultTitleFor(file)

    setState({ kind: 'preparing', fileName: file.name })

    try {
      const recording = await createRecording.mutateAsync({ title, source: 'UPLOAD' as const })
      const { url } = await getUploadUrl.mutateAsync({
        recordingId: recording.id,
        contentType,
        extension: ext,
      })
      await putWithProgress(url, file, contentType, (pct) =>
        setState({ kind: 'uploading', fileName: file.name, pct })
      )
      setState({ kind: 'finalizing', fileName: file.name })
      await confirmUpload.mutateAsync({
        recordingId: recording.id,
        fileSize: file.size,
        mimeType: contentType,
      })
      await utils.recordings.list.invalidate()
      setState({ kind: 'done', fileName: file.name })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Upload failed.' })
    }
  }

  const inProgress =
    state.kind === 'preparing' ||
    state.kind === 'uploading' ||
    state.kind === 'finalizing'

  const pct =
    state.kind === 'uploading' ? state.pct :
    state.kind === 'finalizing' ? 100 : 0

  const progressLabel =
    state.kind === 'preparing' ? 'Preparing…' :
    state.kind === 'uploading' ? `Uploading… ${state.pct}%` :
    state.kind === 'finalizing' ? 'Finishing…' : ''

  return (
    <div className="min-h-screen bg-[#0F0F13] flex flex-col items-center justify-start px-4 pt-12 pb-24">
      {/* Logo / wordmark */}
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold tracking-widest text-[#CA2625] uppercase mb-1">Kolasys AI</p>
        <h1 className="text-2xl font-bold text-white">Upload a Voice Memo</h1>
        <p className="mt-2 text-sm text-neutral-400">Transcribes and summarises your recording automatically.</p>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleFile(file)
        }}
      />

      {/* Upload button */}
      {state.kind !== 'done' && (
        <button
          type="button"
          onClick={() => !inFlight && inputRef.current?.click()}
          disabled={inFlight}
          className="w-full max-w-sm rounded-2xl bg-[#CA2625] px-6 py-5 text-white font-semibold text-lg shadow-lg active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          <Upload className="h-5 w-5 shrink-0" />
          {inFlight ? progressLabel : 'Choose File to Upload'}
        </button>
      )}

      {/* Progress bar */}
      {inProgress && (
        <div className="w-full max-w-sm mt-4">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#CA2625] transition-[width] duration-200"
              style={{ width: state.kind === 'preparing' ? '5%' : `${pct}%` }}
            />
          </div>
          {state.kind !== 'preparing' && (
            <p className="mt-1.5 text-center text-xs text-neutral-400 truncate">
              {'fileName' in state ? state.fileName : ''}
            </p>
          )}
        </div>
      )}

      {/* Success state */}
      {state.kind === 'done' && (
        <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center">
          <CheckCircle className="h-14 w-14 text-green-400" />
          <div>
            <p className="text-white font-semibold text-lg">Upload complete!</p>
            <p className="text-sm text-neutral-400 mt-1 truncate max-w-xs">{state.fileName}</p>
            <p className="text-sm text-neutral-400 mt-1">Transcription is queued — check the app in a few minutes.</p>
          </div>
          <button
            onClick={() => setState({ kind: 'idle' })}
            className="mt-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
          >
            Upload another
          </button>
        </div>
      )}

      {/* Error */}
      {state.kind === 'error' && (
        <div className="w-full max-w-sm mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3">
          <p className="flex-1 text-sm text-red-300">{state.message}</p>
          <button onClick={() => setState({ kind: 'idle' })} className="text-red-400 hover:text-red-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* iPhone step-by-step instructions */}
      {(state.kind === 'idle' || state.kind === 'error') && (
        <div className="w-full max-w-sm mt-10">
          <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase mb-4">
            📱 iPhone — How to upload from Voice Memos
          </p>

          <ol className="space-y-4">
            {[
              {
                step: '1',
                title: 'Tap "Choose File to Upload" above',
                detail: 'This opens the iOS file picker.',
              },
              {
                step: '2',
                title: 'Tap "Browse" in the bottom-right',
                detail: 'Switches from Recents to the full file browser.',
              },
              {
                step: '3',
                title: 'Tap "On My iPhone"',
                detail: 'Then open the Voice Memos folder.',
              },
              {
                step: '4',
                title: 'Select your recording',
                detail: 'The upload starts immediately.',
              },
            ].map(({ step, title, detail }) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#CA2625]/20 text-xs font-bold text-[#CA2625]">
                  {step}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <p className="text-xs text-neutral-500">
              <span className="text-neutral-300 font-medium">Alternatively:</span> Open Voice Memos → tap a recording → tap the share icon → "Save to Files" → pick any folder → come back here and upload it.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-neutral-600">
            Supports .m4a, .mp3, .wav, .aac, .caf, .mp4 · Max 500 MB
          </p>
        </div>
      )}
    </div>
  )
}
