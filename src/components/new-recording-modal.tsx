'use client'

// Kolasys AI — New Recording modal (upload / browser record / meeting bot)

import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Upload, Mic, Monitor, Video, Sparkles } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { trpc } from '@/lib/trpc'
import { BrowserRecorder } from './browser-recorder'
import { TRANSCRIPTION_LANGUAGES } from './default-language-selector'
import { cn } from '@/lib/utils'
import { pickAutoApplyTemplate } from '@/lib/template-matcher'

type Tab = 'upload' | 'browser' | 'desktop' | 'bot'

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
  const [language, setLanguage] = useState('en')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const createRecording = trpc.recordings.create.useMutation()
  const getUploadUrl = trpc.recordings.getUploadUrl.useMutation()
  const confirmUpload = trpc.recordings.confirmUpload.useMutation()

  // Client-side auto-apply hint — runs the same matcher as the server worker
  // against the title as the user types, so they can see which AI Skill will
  // fire before the recording is even created.
  const { data: templates } = trpc.templates.list.useQuery(undefined, {
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const matchedTemplate = useMemo(() => {
    if (!title.trim() || !templates?.length) return null
    return pickAutoApplyTemplate(templates, title, [])
  }, [title, templates])

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
        language: language === 'auto' ? undefined : language,
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
        language: language === 'auto' ? undefined : language,
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
    setLanguage('en')
    setMeetingUrl('')
    setError(null)
    setTab('upload')
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'upload', label: 'Upload File', icon: <Upload className="h-4 w-4" /> },
    { id: 'browser', label: 'Record Now', icon: <Mic className="h-4 w-4" /> },
    { id: 'desktop', label: 'Desktop', icon: <Monitor className="h-4 w-4" /> },
    { id: 'bot', label: 'Meeting Bot', icon: <Video className="h-4 w-4" /> },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-none sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6 data-[state=closed]:sm:zoom-out-95 data-[state=open]:sm:zoom-in-95 data-[state=closed]:sm:slide-out-to-bottom-0 data-[state=open]:sm:slide-in-from-bottom-0">
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
              {matchedTemplate && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#CA2625]">
                  <Sparkles className="h-3 w-3" />
                  <span>
                    AI Skills: <strong className="font-semibold">{matchedTemplate.name}</strong> template will be used
                  </span>
                </p>
              )}
            </div>

            {/* Language */}
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {TRANSCRIPTION_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Matching the spoken language improves transcription accuracy and speed.
              </p>
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
            {tab === 'bot' && (
              <p className="-mt-2 text-center text-[11px] text-neutral-500">
                (visible to participants)
              </p>
            )}

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

            {tab === 'desktop' && (
              <div className="space-y-3">
                <div className="flex flex-col items-center rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#CA2625]/10">
                    <Monitor className="h-6 w-6 text-[#CA2625]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900">
                      Record without a bot
                    </h3>
                    <span className="rounded-full bg-[#CA2625]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#CA2625]">
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-2 max-w-sm text-xs leading-relaxed text-neutral-500">
                    The Kolasys AI Mac desktop app captures system audio locally during any meeting —
                    Zoom, Meet, Teams, a phone call — so{' '}
                    <span className="font-medium text-neutral-700">no bot joins the call</span>.
                    The audio never leaves your machine until you hit upload.
                  </p>
                  <a
                    href="mailto:hi@kolasys.ai?subject=Desktop%20App%20Beta"
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#CA2625] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b21f1f]"
                  >
                    Request beta access
                  </a>
                </div>
              </div>
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
                {/* Consent notice */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800">Recording consent required</p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    By sending a bot you confirm that all participants have been informed that
                    the meeting will be recorded. Depending on your jurisdiction, recording without
                    consent may be unlawful. You are solely responsible for compliance.
                  </p>
                </div>
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
