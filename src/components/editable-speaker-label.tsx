'use client'

// Kolasys AI — Click-to-rename speaker label inline in the transcript.
// On commit, calls `recordings.nameSpeakers` (which updates every
// matching TranscriptSegment + the SpeakerLabel row) then refreshes the
// server component so all instances re-render with the new name.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

export function EditableSpeakerLabel({
  recordingId,
  speakerId,
  displayName,
  className,
}: {
  recordingId: string
  /** The current speaker token in the segment (e.g. "SPEAKER_0" or a name). */
  speakerId: string
  /** What to render — usually the labeled name, falls back to speakerId. */
  displayName: string
  className?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayName)
  const inputRef = useRef<HTMLInputElement>(null)

  // Stay in sync if the parent updates the displayName from outside (e.g.
  // a sibling label was renamed and the page refreshed).
  useEffect(() => {
    if (!editing) setDraft(displayName)
  }, [displayName, editing])

  const nameSpeakers = trpc.recordings.nameSpeakers.useMutation({
    onSuccess: () => {
      setEditing(false)
      router.refresh()
    },
  })

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editing])

  function commit() {
    const next = draft.trim()
    if (!next || next === displayName.trim()) {
      setEditing(false)
      setDraft(displayName)
      return
    }
    nameSpeakers.mutate({
      recordingId,
      speakerMappings: [{ from: speakerId, to: next.slice(0, 100) }],
    })
  }

  function cancel() {
    setDraft(displayName)
    setEditing(false)
  }

  if (editing) {
    return (
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
        maxLength={100}
        disabled={nameSpeakers.isPending}
        className={cn(
          'rounded border border-accent bg-surface px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-accent/25',
          className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      className={cn(
        'rounded px-1 -mx-1 transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]',
        className,
      )}
      title="Click to rename speaker"
    >
      {displayName}
    </button>
  )
}
