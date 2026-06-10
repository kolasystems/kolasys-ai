'use client'

// Kolasys AI — Webhook endpoint management section for the Settings page.
//
// Mirrors the ApiKeysSection patterns: Radix Dialog, reveal-once secret treatment
// (amber warning + code + copy), inline confirm-before-delete, list with metadata.
//
// Role enforcement is server-side (OWNER/ADMIN only for mutations). FORBIDDEN
// errors are surfaced in-place so MEMBER users see a clear message rather than
// a silent failure.

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Plus,
  RotateCw,
  Trash2,
  Webhook,
  X,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

// Reveal-once state — shared between create and rotate flows.
type SecretReveal = {
  secret: string
  context: 'create' | 'rotate'
}

// ── Component ────────────────────────────────────────────────────────────────

export function WebhooksSection() {
  const utils = trpc.useUtils()
  const { data: endpoints, isLoading } = trpc.webhooks.list.useQuery()

  // ── Add endpoint modal state ─────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // ── Reveal-once modal (reused for both create + rotate) ──────────────────
  const [reveal, setReveal] = useState<SecretReveal | null>(null)
  const [revealCopied, setRevealCopied] = useState(false)

  // ── Rotate confirm dialog state ──────────────────────────────────────────
  const [rotateTarget, setRotateTarget] = useState<string | null>(null)
  const [rotateError, setRotateError] = useState<string | null>(null)

  // ── Delete inline confirm state (same pattern as API keys revoke) ────────
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Per-endpoint toggle pending ──────────────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = trpc.webhooks.create.useMutation({
    onSuccess: (data) => {
      closeAddModal()
      setReveal({ secret: data.secret, context: 'create' })
      utils.webhooks.list.invalidate()
    },
    onError: (e) => setAddError(e.message),
  })

  const updateMutation = trpc.webhooks.update.useMutation({
    onSuccess: () => {
      setTogglingId(null)
      utils.webhooks.list.invalidate()
    },
    onError: () => {
      setTogglingId(null)
      utils.webhooks.list.invalidate() // reload to restore actual DB state
    },
  })

  const deleteMutation = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      setDeletingId(null)
      setDeleteError(null)
      utils.webhooks.list.invalidate()
    },
    onError: (e) => setDeleteError(e.message),
  })

  const rotateMutation = trpc.webhooks.rotateSecret.useMutation({
    onSuccess: (data) => {
      setRotateTarget(null)
      setRotateError(null)
      setReveal({ secret: data.secret, context: 'rotate' })
      utils.webhooks.list.invalidate()
    },
    onError: (e) => setRotateError(e.message),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    createMutation.mutate({
      url: newUrl.trim(),
      description: newDesc.trim() || undefined,
    })
  }

  function handleCopyReveal() {
    if (!reveal) return
    navigator.clipboard.writeText(reveal.secret).then(() => {
      setRevealCopied(true)
      setTimeout(() => setRevealCopied(false), 2000)
    })
  }

  function closeAddModal() {
    setAddOpen(false)
    setNewUrl('')
    setNewDesc('')
    setAddError(null)
    createMutation.reset()
  }

  function closeReveal() {
    setReveal(null)
    setRevealCopied(false)
  }

  function closeRotate() {
    setRotateTarget(null)
    setRotateError(null)
    rotateMutation.reset()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Webhook className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Webhooks
            </h2>
            <p className="text-xs text-neutral-500 dark:text-gray-400">
              Receive signed HTTP POST notifications when recordings finish processing.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#CA2625] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#b21f1f]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add endpoint
        </button>
      </div>

      {/* ── Endpoint list ──────────────────────────────────────────────────── */}
      <div className="divide-y divide-neutral-100 dark:divide-white/10">
        {isLoading && (
          <p className="px-6 py-4 text-xs text-neutral-500 dark:text-gray-400">
            Loading endpoints…
          </p>
        )}

        {!isLoading && endpoints?.length === 0 && (
          <div className="px-6 py-6">
            <p className="text-sm font-medium text-neutral-700 dark:text-gray-200">
              No webhook endpoints yet
            </p>
            <p className="mt-1 max-w-prose text-xs text-neutral-500 dark:text-gray-400">
              Add an endpoint URL and Kolasys AI will POST a signed{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-white/10">
                recording.ready
              </code>{' '}
              event each time a meeting finishes processing. The payload includes
              the title, AI summary, and action-item count. Verify requests with
              the <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-white/10">X-Kolasys-Signature</code> header
              using HMAC-SHA256.
            </p>
          </div>
        )}

        {endpoints?.map((ep) => {
          const isToggling = togglingId === ep.id
          const isDeleting = deletingId === ep.id

          return (
            <div key={ep.id} className="px-6 py-3">
              <div className="flex items-start gap-4">

                {/* URL + meta */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                    {ep.url}
                  </p>
                  {ep.description && (
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-gray-400">
                      {ep.description}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-mono text-xs text-neutral-400 dark:text-gray-500">
                      {ep.secretHint}
                    </span>
                    <span className="text-xs text-neutral-400 dark:text-gray-500">
                      Added {formatDate(ep.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-shrink-0 items-center gap-2">

                  {/* Enabled toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ep.enabled}
                    disabled={isToggling}
                    onClick={() => {
                      setTogglingId(ep.id)
                      updateMutation.mutate({ id: ep.id, enabled: !ep.enabled })
                    }}
                    title={ep.enabled ? 'Disable endpoint' : 'Enable endpoint'}
                    className={cn(
                      'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#CA2625]/30 disabled:opacity-60',
                      ep.enabled
                        ? 'bg-[#CA2625]'
                        : 'bg-neutral-300 dark:bg-white/15',
                    )}
                  >
                    {isToggling ? (
                      <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
                    ) : (
                      <span
                        className={cn(
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                          ep.enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
                        )}
                      />
                    )}
                  </button>

                  {/* Rotate secret */}
                  <button
                    type="button"
                    onClick={() => { setRotateTarget(ep.id); setRotateError(null) }}
                    title="Rotate signing secret"
                    className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>

                  {/* Delete — inline confirm */}
                  {isDeleting ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate({ id: ep.id })}
                        disabled={deleteMutation.isPending}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeletingId(null); setDeleteError(null) }}
                        className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:text-gray-400 dark:hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setDeletingId(ep.id); setDeleteError(null) }}
                      title="Delete endpoint"
                      className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Delete error (shown in-row below confirm buttons) */}
              {isDeleting && deleteError && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {deleteError}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Add endpoint dialog ─────────────────────────────────────────────── */}
      <Dialog.Root
        open={addOpen}
        onOpenChange={(o) => (o ? setAddOpen(true) : closeAddModal())}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:bg-[#1A1A24]">
            <div className="flex items-start justify-between">
              <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                Add webhook endpoint
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:text-gray-400 dark:hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-gray-200">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  placeholder="https://your-server.com/webhook"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-gray-200">
                  Description{' '}
                  <span className="font-normal text-neutral-400 dark:text-gray-500">
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production CRM sync"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>

              {addError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {addError}
                </p>
              )}

              <button
                type="submit"
                disabled={!newUrl.trim() || createMutation.isPending}
                className="w-full rounded-lg bg-[#CA2625] py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b21f1f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating…' : 'Create endpoint'}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Rotate confirm dialog ───────────────────────────────────────────── */}
      <Dialog.Root
        open={rotateTarget !== null}
        onOpenChange={(o) => { if (!o) closeRotate() }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:bg-[#1A1A24]">
            <div className="flex items-start justify-between">
              <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                Rotate signing secret
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  disabled={rotateMutation.isPending}
                  className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 disabled:pointer-events-none dark:text-gray-400 dark:hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Existing receivers will need the new secret.</strong>{' '}
                  Update any services that verify the{' '}
                  <code className="rounded bg-amber-100 px-0.5 py-0.5 font-mono dark:bg-amber-900/30">
                    X-Kolasys-Signature
                  </code>{' '}
                  header before the next delivery attempt.
                </p>
              </div>

              {rotateError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {rotateError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => rotateTarget && rotateMutation.mutate({ id: rotateTarget })}
                  disabled={rotateMutation.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#CA2625] py-2 text-sm font-semibold text-white hover:bg-[#b21f1f] disabled:opacity-50"
                >
                  {rotateMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Rotate secret
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={rotateMutation.isPending}
                    className="flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Reveal-once dialog (create and rotate share this) ──────────────── */}
      <Dialog.Root
        open={reveal !== null}
        onOpenChange={(o) => { if (!o) closeReveal() }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:bg-[#1A1A24]">
            <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
              {reveal?.context === 'create'
                ? 'Save your signing secret'
                : 'New signing secret'}
            </Dialog.Title>

            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Copy your signing secret now — it won&apos;t be shown again.</strong>{' '}
                  Store it in your server&apos;s environment variables and use it to verify
                  the <code className="rounded bg-amber-100 px-0.5 py-0.5 font-mono dark:bg-amber-900/30">X-Kolasys-Signature</code> header on incoming requests.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-gray-400">
                  Signing secret
                </label>
                <div className="flex items-stretch overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/5">
                  <code className="flex-1 break-all px-3 py-2 font-mono text-xs text-neutral-900 dark:text-white">
                    {reveal?.secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyReveal}
                    className={cn(
                      'flex items-center gap-1.5 border-l border-neutral-200 px-3 text-xs font-semibold transition-colors dark:border-white/10',
                      revealCopied
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                        : 'bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10',
                    )}
                  >
                    {revealCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {revealCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={closeReveal}
                className="w-full rounded-lg border border-neutral-200 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
              >
                Done
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </section>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
