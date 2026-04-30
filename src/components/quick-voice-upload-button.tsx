'use client'

// Kolasys AI — One-tap voice/video upload from device.
// On mobile this opens the native picker including Voice Memos and Files.
// Auto-generates a title from the filename (or a timestamped fallback) and
// pushes through the same upload pipeline as the New Recording modal.

import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type UploadState =
  | { kind: 'idle' }
  | { kind: 'preparing'; fileName: string }
  | { kind: 'uploading'; fileName: string; pct: number }
  | { kind: 'finalizing'; fileName: string }
  | { kind: 'error'; message: string }
  | { kind: 'done' }

// Audio-only — explicit extensions plus the MIME wildcard so iOS Safari
// surfaces Voice Memos in the share-picker alongside Files. `.caf` is the
// Core Audio Format Voice Memos uses natively; `.mp4` covers the
// audio-only mp4 container used when memos are exported. Dropping
// `video/*` removes the "Take Video" affordance from iOS.
const ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac,.mp4,.caf'
const MAX_SIZE = 500 * 1024 * 1024 // 500 MB

function defaultTitleFor(file: File): string {
  const stripped = file.name.replace(/\.[^.]+$/, '').trim()
  if (stripped) return stripped.slice(0, 200)
  return `Voice memo — ${new Date().toLocaleString()}`
}

export function QuickVoiceUploadButton() {
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

  function pickFile() {
    if (inFlight) return
    inputRef.current?.click()
  }

  async function handleFile(file: File) {
    if (file.size > MAX_SIZE) {
      setState({ kind: 'error', message: 'File is too large (max 500 MB).' })
      return
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'
    const contentType = file.type || `audio/${ext}`
    const title = defaultTitleFor(file)

    setState({ kind: 'preparing', fileName: file.name })

    try {
      const recording = await createRecording.mutateAsync({
        title,
        source: 'UPLOAD' as const,
      })

      const { url } = await getUploadUrl.mutateAsync({
        recordingId: recording.id,
        contentType,
        extension: ext,
      })

      // XHR for progress reporting — fetch can't expose upload progress.
      await putWithProgress(url, file, contentType, (pct) => {
        setState({ kind: 'uploading', fileName: file.name, pct })
      })

      setState({ kind: 'finalizing', fileName: file.name })
      await confirmUpload.mutateAsync({
        recordingId: recording.id,
        fileSize: file.size,
        mimeType: contentType,
      })

      await utils.recordings.list.invalidate()
      setState({ kind: 'done' })
      // Reset visible state after a brief success flash.
      setTimeout(() => setState({ kind: 'idle' }), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      setState({ kind: 'error', message })
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset the input so picking the same file twice still triggers onChange.
          e.target.value = ''
          if (file) handleFile(file)
        }}
      />

      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={pickFile}
          disabled={inFlight}
          title="Upload audio or Voice Memo"
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          Upload audio or Voice Memo
        </button>
        {!inFlight && (
          <p className="text-xs text-neutral-500 mt-1">
            On iPhone: Choose File → On My iPhone → Voice Memos
          </p>
        )}
      </div>

      <UploadStatus state={state} onDismiss={() => setState({ kind: 'idle' })} />
    </>
  )
}

// ── Upload progress XHR ────────────────────────────────────────────────────

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
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`S3 PUT failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(file)
  })
}

// ── Floating status pill ───────────────────────────────────────────────────

function UploadStatus({
  state,
  onDismiss,
}: {
  state: UploadState
  onDismiss: () => void
}) {
  if (state.kind === 'idle') return null

  if (state.kind === 'error') {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-lg dark:border-red-500/30 dark:bg-red-500/10">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">
            {state.message}
          </p>
          <button
            onClick={onDismiss}
            className="rounded p-1 text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  if (state.kind === 'done') {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border border-green-200 bg-green-50 px-4 py-3 shadow-lg dark:border-green-500/30 dark:bg-green-500/10">
        <p className="text-sm text-green-800 dark:text-green-200">
          Upload complete — transcription queued.
        </p>
      </div>
    )
  }

  // At this point TS has narrowed `state` to the in-flight kinds, all of
  // which carry a `fileName`.
  const fileName = state.fileName
  const pct = state.kind === 'uploading' ? state.pct : 100
  const label =
    state.kind === 'preparing'
      ? 'Preparing…'
      : state.kind === 'uploading'
        ? `Uploading… ${pct}%`
        : 'Finishing…'

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border border-line bg-surface px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-primary">{fileName}</p>
          <p className="mt-0.5 text-xs text-secondary">{label}</p>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-muted)_15%,transparent)]">
        <div
          className="h-full bg-accent transition-[width] duration-150"
          style={{
            width:
              state.kind === 'preparing'
                ? '5%'
                : state.kind === 'uploading'
                  ? `${pct}%`
                  : '100%',
          }}
        />
      </div>
    </div>
  )
}
