'use client'

// Kolasys AI — Click-to-edit series title. Mirrors the pattern in
// editable-recording-title.tsx. Submits via `series.rename`; flipping
// autoDetected to false happens server-side in the mutation.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

export function EditableSeriesTitle({
  seriesId,
  initialName,
}: {
  seriesId: string
  initialName: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)

  const rename = trpc.series.rename.useMutation({
    onSuccess: () => {
      setEditing(false)
      router.refresh()
    },
    onError: (e) => setError(e.message),
  })

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null)
          setEditing(true)
        }}
        className="group flex items-center gap-2 text-left"
      >
        <h1 className="truncate text-base font-semibold text-primary sm:text-lg">
          {name}
        </h1>
        <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    )
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || trimmed.length > 100) return
        rename.mutate({ id: seriesId, name: trimmed })
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        className="flex-1 rounded-md border border-line bg-white px-2 py-1 text-base font-semibold text-primary outline-none focus:border-accent dark:bg-[#1A1A24] sm:text-lg"
      />
      <button
        type="submit"
        disabled={rename.isPending || !name.trim()}
        className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 dark:hover:bg-emerald-500/10"
        aria-label="Save"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          setName(initialName)
          setEditing(false)
          setError(null)
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
        aria-label="Cancel"
      >
        <X className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-rose-500">{error}</span>}
    </form>
  )
}
