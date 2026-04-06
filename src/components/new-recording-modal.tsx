'use client'

// Kolasys AI — New Recording modal (upload / browser record / meeting bot)

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Upload, Mic, Video } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { trpc } from '@/lib/trpc'
import { BrowserRecorder } from './browser-recorder'
import { cn } from '@/lib/utils'

type Tab = 'upload' | 'browser' | 'bot'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Extract a human-readable message from any thrown value. */
function extractError(err: unknown): string {
  if (err instanceof Error) {
    // tRPC wraps the server message in err.message — use it directly.
    return err.message
  }
  return 'Something went wrong.'
}

export function NewRecordingModal({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState<Tab>('upload')
  const [title, setTitle] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const createRecording = trpc.recordings.create.useMutation()
  const getUploadUrl = trpc.recordings.getUploadUrl.useMutation()
  const confirmUpload = trpc.recordings.confirmUpload.useMutation()

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    acceptedFiles,
    fileRejections,
  } = useDropzone({
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg'],
      'video/*': ['.mp4', '.webm', '.mov'],
    },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500 MB
  })

  const selectedFile = acceptedFiles[0] ?? null
  const rejectedFile = fileRejections[0] ?? null

  async function handleFileUpload() {
    console.log('[upload] handleFileUpload called', { selectedFile, title })

    if (!selectedFile) {
      setError('Please select a file first.')
      return
    }
    if (!title.trim()) {
      setError('Please enter a title.')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() ?? 'mp3'
      // Some browsers/OS return empty string for certain audio/video MIME types.
      const contentType = selectedFile.type || `audio/${ext}`

      console.log('[upload] Step 1 — creating recording DB record', { title: title.trim(), ext, contentType })
      const recording = await createRecording.mutateAsync({
        title: title.trim(),
        source: 'UPLOAD' as const,
      })
      console.log('[upload] Step 1 ✓ recording created', recording.id)

      console.log('[upload] Step 2 — requesting pre-signed S3 URL', { recordingId: recording.id, contentType, ext })
      const { url } = await getUploadUrl.mutateAsync({
        recordingId: recording.id,
        contentType,
        extension: ext,
      })
      console.log('[upload] Step 2 ✓ got upload URL (first 80 chars):', url.slice(0, 80))

      console.log('[upload] Step 3 — PUTting file to S3', { size: selectedFile.size, contentType })
      const uploadRes = await fetch(url, {
        method: 'PUT',
        body: selectedFile,
        headers: { 'Content-Type': contentType },
      })
      console.log('[upload] Step 3 — S3 response status:', uploadRes.status)
      if (!uploadRes.ok) {
        const body = await uploadRes.text().catch(() => '')
        throw new Error(`S3 upload failed (${uploadRes.status}): ${body || uploadRes.statusText}`)
      }
      console.log('[upload] Step 3 ✓ file uploaded to S3')

      console.log('[upload] Step 4 — confirming upload, enqueueing transcription')
      await confirmUpload.mutateAsync({
        recordingId: recording.id,
        fileSize: selectedFile.size,
        mimeType: contentType,
      })
      console.log('[upload] Step 4 ✓ upload confirmed')

      await utils.recordings.list.invalidate()
      onOpenChange(false)
      resetForm()
      console.log('[upload] ✓ complete')
    } catch (err) {
      console.error('[upload] ✗ error at some step:', err)
      setError(extractError(err))
    } finally {
      setUploading(false)
    }
  }

  async function handleBrowserRecording(blob: Blob, mimeType: string) {
    if (!title.trim()) {
      setError('Please enter a title.')
      return
    }
    setUploading(true)
    setError(null)

    try {
      const ext = mimeType.includes('webm') ? 'webm' : 'mp3'

      const recording = await createRecording.mutateAsync({
        title: title.trim(),
        source: 'BROWSER' as const,
      })

      const { url } = await getUploadUrl.mutateAsync({
        recordingId: recording.id,
        contentType: mimeType,
        extension: ext,
      })

      const uploadRes = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': mimeType },
      })
      if (!uploadRes.ok) {
        const body = await uploadRes.text().catch(() => '')
        throw new Error(`S3 upload failed (${uploadRes.status}): ${body || uploadRes.statusText}`)
      }

      await confirmUpload.mutateAsync({
        recordingId: recording.id,
        fileSize: blob.size,
        mimeType,
      })

      await utils.recordings.list.invalidate()
      onOpenChange(false)
      resetForm()
    } catch (err) {
      console.error('[upload] browser recording error:', err)
      setError(extractError(err))
    } finally {
      setUploading(false)
    }
  }

  async function handleBotDeploy() {
    if (!title.trim() || !meetingUrl.trim()) return
    setUploading(true)
    setError(null)

    try {
      await createRecording.mutateAsync({
        title: title.trim(),
        source: 'MEETING_BOT' as const,
        meetingUrl: meetingUrl.trim(),
      })
      await utils.recordings.list.invalidate()
      onOpenChange(false)
      resetForm()
    } catch (err) {
      console.error('[upload] bot deploy error:', err)
      setError(extractError(err))
    } finally {
      setUploading(false)
    }
  }

  function resetForm() {
    setTitle('')
    setMeetingUrl('')
    setError(null)
    setTab('upload')
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'upload', label: 'Upload File', icon: <Upload className="h-4 w-4" /> },
    { id: 'browser', label: 'Record Now', icon: <Mic className="h-4 w-4" /> },
    { id: 'bot', label: 'Meeting Bot', icon: <Video className="h-4 w-4" /> },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              New Recording
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 hover:bg-neutral-100 transition-colors">
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 space-y-4">
            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Weekly team sync"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg border border-neutral-200 p-1 gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition-colors',
                    tab === t.id
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'upload' && (
              <div className="space-y-3">
                <div
                  {...getRootProps()}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                    isDragActive
                      ? 'border-brand-500 bg-brand-50'
                      : selectedFile
                      ? 'border-green-400 bg-green-50'
                      : 'border-neutral-300 hover:border-brand-400'
                  )}
                >
                  <input {...getInputProps()} />
                  <Upload className="mx-auto mb-2 h-8 w-8 text-neutral-400" />
                  {selectedFile ? (
                    <p className="text-sm font-medium text-green-700">
                      {selectedFile.name}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-neutral-700">
                        Drop a file or click to browse
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        MP3, WAV, M4A, MP4, WebM — up to 500 MB
                      </p>
                    </>
                  )}
                </div>

                {/* File rejection feedback */}
                {rejectedFile && (
                  <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700">
                    {rejectedFile.errors[0]?.code === 'file-too-large'
                      ? 'File is too large (max 500 MB).'
                      : rejectedFile.errors[0]?.code === 'file-invalid-type'
                      ? 'Unsupported file type. Please use MP3, WAV, M4A, MP4, or WebM.'
                      : (rejectedFile.errors[0]?.message ?? 'File was rejected.')}
                  </p>
                )}

                {/* Validation hint */}
                {selectedFile && !title.trim() && (
                  <p className="text-xs text-amber-600">
                    Enter a title above to enable upload.
                  </p>
                )}
                {!selectedFile && title.trim() && (
                  <p className="text-xs text-amber-600">
                    Select a file to enable upload.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={!selectedFile || !title.trim() || uploading}
                  className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Uploading…' : 'Upload & Transcribe'}
                </button>
              </div>
            )}

            {tab === 'browser' && (
              <BrowserRecorder onRecordingComplete={handleBrowserRecording} />
            )}

            {tab === 'bot' && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Meeting URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://meet.google.com/abc-defg-hij"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <p className="text-xs text-neutral-500">
                  Kolasys AI will join the meeting, record it, and generate notes automatically.
                </p>
                <button
                  type="button"
                  onClick={handleBotDeploy}
                  disabled={!meetingUrl.trim() || !title.trim() || uploading}
                  className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Sending bot…' : 'Send Bot to Meeting'}
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
