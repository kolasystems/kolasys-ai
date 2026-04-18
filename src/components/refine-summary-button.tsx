'use client'

// Kolasys AI — "Refine Summary" button with Condense / Elaborate dropdown.
// Stubs the call today; real AI refinement will be wired later on the server.

import { useState } from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Sparkles, ChevronDown, Minimize2, Maximize2, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Mode = 'condense' | 'elaborate'

type Props = {
  recordingId: string
  onRefined: (summary: string) => void
}

export function RefineSummaryButton({ recordingId, onRefined }: Props) {
  const [pending, setPending] = useState<Mode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutation = trpc.recordings.refineSummary.useMutation({
    onSuccess: (data) => {
      onRefined(data.summary)
      setPending(null)
    },
    onError: (err) => {
      setError(err.message)
      setPending(null)
    },
  })

  function pick(mode: Mode) {
    setError(null)
    setPending(mode)
    mutation.mutate({ recordingId, mode })
  }

  const busy = mutation.isPending

  return (
    <div className="relative">
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            disabled={busy}
            className="glass-subtle flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-accent" />
            )}
            {busy
              ? pending === 'condense'
                ? 'Condensing…'
                : 'Elaborating…'
              : 'Refine Summary'}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </Dropdown.Trigger>

        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[220px] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg focus:outline-none dark:border-white/10 dark:bg-[#1A1A24]"
          >
            <Dropdown.Item
              onSelect={(e) => {
                e.preventDefault()
                pick('condense')
              }}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm text-primary outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
            >
              <Minimize2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
              <div>
                <p className="font-medium">Condense</p>
                <p className="text-xs text-secondary">Rewrite the summary as a tighter version.</p>
              </div>
            </Dropdown.Item>

            <Dropdown.Item
              onSelect={(e) => {
                e.preventDefault()
                pick('elaborate')
              }}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm text-primary outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
            >
              <Maximize2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
              <div>
                <p className="font-medium">Elaborate</p>
                <p className="text-xs text-secondary">Expand with more context and detail.</p>
              </div>
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      {error && (
        <p className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 shadow-sm dark:bg-red-500/15 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
