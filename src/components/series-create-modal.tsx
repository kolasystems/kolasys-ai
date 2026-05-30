'use client'

// Kolasys AI — "New folder" dialog. Triggered from the sidebar's Series
// section (and any future "+ New folder" entry point). Owns its own name
// state + create mutation; invalidates `series.list` so the sidebar and
// any meeting-row pickers refetch on success.

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SeriesCreateModal({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = trpc.series.create.useMutation({
    onSuccess: async () => {
      await utils.series.list.invalidate()
      setName('')
      setError(null)
      onOpenChange(false)
    },
    onError: (e) => setError(e.message),
  })

  function reset() {
    setName('')
    setError(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100) return
    create.mutate({ name: trimmed })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 dark:bg-[#1A1A24]">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
              New folder
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-1 transition-colors hover:bg-neutral-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-sm text-neutral-600 dark:text-gray-400">
            Group related meetings into a folder. You can add meetings from the
            meetings list later.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="series-name"
                className="mb-1 block text-xs font-medium text-neutral-700 dark:text-gray-300"
              >
                Folder name
              </label>
              <input
                id="series-name"
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="e.g. Rising Hope Board"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={create.isPending || !name.trim()}
                className="flex min-w-[110px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: '#CA2625' }}
              >
                {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create folder
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
