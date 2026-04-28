'use client'

// Kolasys AI — API Keys section for the Settings page.
// Lists active keys with their preview + last-used timestamp, lets the user
// create a new key (raw value shown ONCE in a copy modal), and revoke keys.

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Copy, Key, Plus, Trash2, X, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type CreatedKey = {
  id: string
  name: string
  key: string
  keyPreview: string
  createdAt: Date | string
}

export function ApiKeysSection() {
  const utils = trpc.useUtils()
  const { data: keys, isLoading } = trpc.apiKeys.list.useQuery()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data)
      setNewName('')
      utils.apiKeys.list.invalidate()
    },
  })

  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      setRevokingId(null)
      utils.apiKeys.list.invalidate()
    },
  })

  function handleCreate() {
    if (!newName.trim()) return
    createMutation.mutate({ name: newName.trim() })
  }

  function handleCopy() {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey.key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function closeCreateModal() {
    setCreateOpen(false)
    setCreatedKey(null)
    setCopied(false)
    setNewName('')
    createMutation.reset()
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Key className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              API Keys
            </h2>
            <p className="text-xs text-neutral-500 dark:text-gray-400">
              Programmatic access to recordings, transcripts, and action items.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#CA2625] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#b21f1f]"
        >
          <Plus className="h-3.5 w-3.5" />
          New key
        </button>
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-white/10">
        {isLoading && (
          <p className="px-6 py-4 text-xs text-neutral-500 dark:text-gray-400">
            Loading keys…
          </p>
        )}

        {!isLoading && keys && keys.length === 0 && (
          <p className="px-6 py-4 text-xs text-neutral-500 dark:text-gray-400">
            No API keys yet. Create one to start using the REST API.
          </p>
        )}

        {keys?.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-4 px-6 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                {k.name}
              </p>
              <p className="mt-0.5 font-mono text-xs text-neutral-500 dark:text-gray-400">
                kol_…{k.keyPreview}
              </p>
            </div>
            <div className="hidden text-right text-xs text-neutral-500 dark:text-gray-400 sm:block">
              <p>Created {formatDate(k.createdAt)}</p>
              <p>
                {k.lastUsedAt ? `Last used ${formatDate(k.lastUsedAt)}` : 'Never used'}
              </p>
            </div>
            {revokingId === k.id ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => revokeMutation.mutate({ id: k.id })}
                  disabled={revokeMutation.isPending}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {revokeMutation.isPending ? 'Revoking…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setRevokingId(null)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRevokingId(k.id)}
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                title="Revoke key"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Create-key modal */}
      <Dialog.Root open={createOpen} onOpenChange={(o) => (o ? setCreateOpen(true) : closeCreateModal())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:bg-[#1A1A24]">
            <div className="flex items-start justify-between">
              <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                {createdKey ? 'Save your new key' : 'Create API key'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:text-gray-400 dark:hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {!createdKey ? (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-gray-200">
                    Key name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Zapier integration"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
                    Used only for display. Choose something memorable.
                  </p>
                </div>
                {createMutation.error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                    {createMutation.error.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                  className="w-full rounded-lg bg-[#CA2625] py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b21f1f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Generating…' : 'Generate key'}
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    <strong>Store this now — it won&apos;t be shown again.</strong>{' '}
                    If you lose it, revoke and create a new one.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-gray-400">
                    {createdKey.name}
                  </label>
                  <div className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/5">
                    <code className="flex-1 break-all px-3 py-2 font-mono text-xs text-neutral-900 dark:text-white">
                      {createdKey.key}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={cn(
                        'flex items-center gap-1.5 border-l border-neutral-200 px-3 text-xs font-semibold transition-colors dark:border-white/10',
                        copied
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                          : 'bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10',
                      )}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="w-full rounded-lg border border-neutral-200 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Done
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
