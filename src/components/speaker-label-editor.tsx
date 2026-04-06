'use client'

// Kolasys AI — Inline speaker name editor
// Click a speaker label to rename it (e.g. "SPEAKER_0" → "Jane Smith")

import { useState, useRef, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Pencil, Check, X } from 'lucide-react'

type Props = {
  recordingId: string
  speakerId: string
  displayName: string
  className?: string
}

export function SpeakerLabelEditor({ recordingId, speakerId, displayName: initialName, className }: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [saved, setSaved] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  const mutation = trpc.recordings.updateSpeakerLabel.useMutation({
    onSuccess: (data) => {
      setSaved(data.displayName)
      setName(data.displayName)
      setEditing(false)
    },
    onError: () => {
      setName(saved) // revert
      setEditing(false)
    },
  })

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setName(saved); setEditing(false); return }
    if (trimmed === saved) { setEditing(false); return }
    mutation.mutate({ recordingId, speakerId, displayName: trimmed })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') { setName(saved); setEditing(false) }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className={`rounded border border-brand-400 bg-white px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${className ?? ''}`}
          style={{ width: `${Math.max(name.length, 8)}ch` }}
          disabled={mutation.isPending}
        />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); handleSave() }} className="text-green-600 hover:text-green-800">
          <Check className="h-3 w-3" />
        </button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); setName(saved); setEditing(false) }} className="text-red-400 hover:text-red-600">
          <X className="h-3 w-3" />
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group inline-flex items-center gap-1 ${className ?? ''}`}
      title="Click to rename speaker"
    >
      <span className="font-semibold">{saved}</span>
      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  )
}
