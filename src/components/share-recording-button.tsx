'use client'

// Kolasys AI — Public-share toggle on the recording detail page.
// Shows "Share" → on click, mints (or restores) the public slug and
// reveals the URL with a copy button. "Make private" reverts.

import { useState } from 'react'
import { Check, Copy, Globe, Lock, Share2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Props = {
  recordingId: string
  initialIsPublic: boolean
  initialSlug: string | null
}

export function ShareRecordingButton({
  recordingId,
  initialIsPublic,
  initialSlug,
}: Props) {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [slug, setSlug] = useState<string | null>(initialSlug)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const makePublic = trpc.recordings.makePublic.useMutation({
    onSuccess: (data) => {
      setIsPublic(true)
      setSlug(data.slug)
      setError(null)
    },
    onError: (err) => setError(err.message),
  })
  const makePrivate = trpc.recordings.makePrivate.useMutation({
    onSuccess: () => {
      setIsPublic(false)
      setError(null)
    },
    onError: (err) => setError(err.message),
  })

  const shareUrl = slug ? `${getOrigin()}/share/${slug}` : ''

  function copy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!isPublic) {
    return (
      <button
        type="button"
        onClick={() => makePublic.mutate({ recordingId })}
        disabled={makePublic.isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-primary shadow-sm hover:bg-[color-mix(in_srgb,var(--text-muted)_8%,transparent)] disabled:opacity-60"
      >
        <Share2 className="h-3.5 w-3.5" />
        {makePublic.isPending ? 'Sharing…' : 'Share'}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-stretch overflow-hidden rounded-md border border-line bg-surface">
        <span className="flex items-center gap-1.5 border-r border-line px-2 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <Globe className="h-3 w-3" />
          Public
        </span>
        <code className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-[11px] text-secondary">
          {shareUrl.replace(/^https?:\/\//, '')}
        </code>
        <button
          type="button"
          onClick={copy}
          className={
            'flex items-center gap-1 border-l border-line px-2 text-[11px] font-semibold transition-colors ' +
            (copied
              ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
              : 'hover:bg-[color-mix(in_srgb,var(--text-muted)_8%,transparent)]')
          }
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button
        type="button"
        onClick={() => makePrivate.mutate({ recordingId })}
        disabled={makePrivate.isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-[color-mix(in_srgb,var(--text-muted)_8%,transparent)] disabled:opacity-60"
      >
        <Lock className="h-3 w-3" />
        {makePrivate.isPending ? 'Making private…' : 'Make private'}
      </button>
      {error && (
        <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}

function getOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}
