'use client'

// Kolasys AI — Inline-editable recording title for the detail page.
// Click → input. Enter or blur saves; Escape reverts. Pencil hint reveals
// on hover for discoverability.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

export function EditableRecordingTitle({
  recordingId,
  initialTitle,
}: {
  recordingId: string
  initialTitle: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialTitle)
  const [saved, setSaved] = useState(initialTitle)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const updateTitle = trpc.recordings.updateTitle.useMutation({
    onSuccess: (data) => {
      setSaved(data.title)
      setDraft(data.title)
      setError(null)
      setEditing(false)
      // Refresh the server component so other surfaces (sidebar history,
      // recordings list, share previews) reflect the new title.
      router.refresh()
    },
    onError: (err) => setError(err.message),
  })

  useEffect(() => {
    if (editing) {
      // Defer focus so the input is in the DOM before we select() it.
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editing])

  function commit() {
    const next = draft.trim()
    if (!next || next === saved) {
      setEditing(false)
      setDraft(saved)
      return
    }
    if (next.length > 200) {
      setError('Title is too long (max 200 chars).')
      return
    }
    updateTitle.mutate({ id: recordingId, title: next })
  }

  function cancel() {
    setDraft(saved)
    setEditing(false)
    setError(null)
  }

  if (editing) {
    return (
      <div className="flex flex-col">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={commit}
          maxLength={200}
          disabled={updateTitle.isPending}
          className="w-full rounded-md border border-line bg-surface px-2 py-1 text-lg font-bold text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-xl"
        />
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors',
        'hover:bg-[color-mix(in_srgb,var(--text-muted)_8%,transparent)]',
      )}
      title="Click to rename"
    >
      <h1 className="truncate text-lg font-bold text-primary sm:text-xl">
        {saved}
      </h1>
      <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
