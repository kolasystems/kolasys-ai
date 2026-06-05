'use client'

import { useRef, useState } from 'react'
import { Bot, Upload, Loader2, CheckCircle2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { useAuth } from '@clerk/nextjs'

export function BotIdentitySection({
  initialBotDisplayName,
  initialBotAvatarUrl,
}: {
  initialBotDisplayName: string | null
  initialBotAvatarUrl: string | null
}) {
  const { getToken } = useAuth()
  const [name, setName] = useState(initialBotDisplayName ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialBotAvatarUrl)
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const updateName = trpc.settings.updateMemberBotDisplayName.useMutation({
    onSuccess: () => {
      setNameStatus('saved')
      setTimeout(() => setNameStatus('idle'), 2000)
    },
  })

  async function handleUpload(file: File) {
    setUploadStatus('uploading')
    setUploadError(null)
    try {
      const token = await getToken()
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/v1/bot-avatar/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed')
        setUploadStatus('error')
      } else {
        setAvatarUrl(data.url ?? null)
        setUploadStatus('done')
      }
    } catch {
      setUploadError('Network error')
      setUploadStatus('error')
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <Bot className="h-4 w-4 text-brand-600 dark:text-accent" />
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Bot Identity</p>
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            Personalise how your Kolasys bot appears in meetings.
          </p>
        </div>
      </div>

      <div className="space-y-6 px-6 py-5">
        {/* Display name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Bot display name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameStatus('idle') }}
              maxLength={100}
              placeholder="Kolasys Notetaker"
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <button
              onClick={() => {
                if (!name.trim()) return
                setNameStatus('saving')
                updateName.mutate({ name: name.trim() })
              }}
              disabled={nameStatus === 'saving' || !name.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {nameStatus === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : nameStatus === 'saved' ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : null}
              {nameStatus === 'saved' ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* Avatar */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Bot camera frame
          </label>
          <p className="mb-3 text-xs text-neutral-500 dark:text-gray-400">
            Upload a logo or photo — we'll render it as a 1280×720 camera frame that appears in meetings.
          </p>

          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="relative h-[81px] w-[144px] flex-none overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900 dark:border-white/10">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Bot camera preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Bot className="h-8 w-8 text-neutral-600" />
                </div>
              )}
              {uploadStatus === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>

            {/* Upload controls */}
            <div className="flex-1">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadStatus === 'uploading'}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200 dark:hover:bg-white/10"
              >
                <Upload className="h-4 w-4" />
                {uploadStatus === 'uploading' ? 'Rendering…' : 'Upload logo'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleUpload(f)
                  e.target.value = ''
                }}
              />
              {uploadStatus === 'done' && (
                <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  ✓ Camera frame updated
                </p>
              )}
              {uploadStatus === 'error' && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {uploadError}
                </p>
              )}
              <p className="mt-1.5 text-xs text-neutral-400">PNG, JPEG, or WebP · max 5 MB</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
