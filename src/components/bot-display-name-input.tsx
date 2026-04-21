'use client'

// Kolasys AI — Inline-editable bot display name on /dashboard/settings.
// Click the name (or the pencil) to enter edit mode; check to save, X or
// Escape to cancel. Persists via trpc.settings.updateOrgSettings.

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Props = {
  initialBotDisplayName: string
}

export function BotDisplayNameInput({ initialBotDisplayName }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialBotDisplayName)
  const [committed, setCommitted] = useState(initialBotDisplayName)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select-all when entering edit mode.
  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const mutation = trpc.settings.updateOrgSettings.useMutation({
    onSuccess: (data) => {
      setCommitted(data.botDisplayName)
      setValue(data.botDisplayName)
      setEditing(false)
      setError(null)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  function cancel() {
    setValue(committed)
    setEditing(false)
    setError(null)
  }

  function save() {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Bot name cannot be empty.')
      return
    }
    if (trimmed === committed) {
      setEditing(false)
      setError(null)
      return
    }
    mutation.mutate({ botDisplayName: trimmed })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  const busy = mutation.isPending

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Recording capture
        </h2>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            Bot display name
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
            Shown to other participants when the recording bot joins a meeting. Defaults to{' '}
            <span className="font-medium text-neutral-700 dark:text-gray-300">Kolasys AI</span>.
          </p>
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={64}
              disabled={busy}
              className={cn(
                'flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900',
                'focus:outline-none focus:ring-2 focus:border-[#CA2625] focus:ring-[#CA2625]/30',
                'dark:border-white/15 dark:bg-white/5 dark:text-white',
                'disabled:opacity-60',
              )}
              placeholder="Kolasys AI"
              aria-label="Bot display name"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              aria-label="Save"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#CA2625] text-white transition-colors hover:bg-[#b21f1f] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              aria-label="Cancel"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left -mx-2 transition-colors hover:bg-neutral-100 dark:hover:bg-white/5"
          >
            <span className="text-base font-semibold text-neutral-900 dark:text-white">
              {committed}
            </span>
            <Pencil className="h-3.5 w-3.5 text-neutral-400 opacity-60 transition-opacity group-hover:opacity-100 dark:text-gray-500" />
          </button>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
