'use client'

// Kolasys AI — Share modal for a recording. Two tabs:
//   • Share link — toggle, copy URL, permissions checkboxes, expiry
//   • Invite     — email input + invitee list
//
// All mutations route through tRPC; the public /share/{slug} page reads
// permissions + expiresAt back to honour what was configured here.

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Check,
  Copy,
  Globe,
  Lock,
  Mail,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Permissions = {
  transcript: boolean
  summary: boolean
  actionItems: boolean
}

const DEFAULT_PERMS: Permissions = {
  transcript: true,
  summary: true,
  actionItems: true,
}

const EXPIRY_PRESETS = [
  { label: 'Never', days: null as number | null },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
]

type Props = {
  recordingId: string
  initialIsPublic: boolean
  initialSlug: string | null
}

type Tab = 'link' | 'invite'

export function ShareRecordingButton({
  recordingId,
  initialIsPublic,
  initialSlug,
}: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('link')

  // Avoid querying until the modal is opened — keeps initial page payload tiny.
  const { data: shareState, refetch } = trpc.recordings.getShareState.useQuery(
    { recordingId },
    { enabled: open },
  )

  // Local mirror of server state so the form stays responsive.
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [slug, setSlug] = useState<string | null>(initialSlug)
  const [perms, setPerms] = useState<Permissions>(DEFAULT_PERMS)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  // Hydrate from server when the query resolves.
  useEffect(() => {
    if (!shareState) return
    setIsPublic(shareState.isPublic)
    setSlug(shareState.publicSlug ?? null)
    if (shareState.sharePermissions && typeof shareState.sharePermissions === 'object') {
      const p = shareState.sharePermissions as Partial<Permissions>
      setPerms({
        transcript: p.transcript ?? true,
        summary: p.summary ?? true,
        actionItems: p.actionItems ?? true,
      })
    }
    // The dropdown can't reverse-engineer arbitrary expiry dates, but we
    // can pick the closest preset for the *display* state. The actual
    // saved value isn't lost — only re-saving overrides it.
    if (shareState.shareExpiresAt) {
      const ms = new Date(shareState.shareExpiresAt).getTime() - Date.now()
      const days = Math.round(ms / (24 * 60 * 60 * 1000))
      const preset = EXPIRY_PRESETS.find((p) => p.days === days)
      setExpiryDays(preset?.days ?? null)
    } else {
      setExpiryDays(null)
    }
  }, [shareState])

  const utils = trpc.useUtils()

  const makePublic = trpc.recordings.makePublic.useMutation({
    onSuccess: (data) => {
      setIsPublic(true)
      setSlug(data.slug)
      refetch()
    },
  })

  const makePrivate = trpc.recordings.makePrivate.useMutation({
    onSuccess: () => {
      setIsPublic(false)
      refetch()
    },
  })

  const expiresAtIso = useMemo(() => {
    if (expiryDays === null) return null
    return new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
  }, [expiryDays])

  const shareUrl = slug ? `${getOrigin()}/share/${slug}` : ''

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function toggleSharing(next: boolean) {
    if (next) {
      await makePublic.mutateAsync({
        recordingId,
        permissions: perms,
        expiresAt: expiresAtIso,
      })
    } else {
      await makePrivate.mutateAsync({ recordingId })
    }
  }

  async function saveSettings() {
    await makePublic.mutateAsync({
      recordingId,
      permissions: perms,
      expiresAt: expiresAtIso,
    })
    utils.recordings.getShareState.invalidate({ recordingId })
  }

  // ── Trigger button (closed state) ────────────────────────────────────────
  const triggerLabel = isPublic ? 'Sharing' : 'Share'
  const TriggerIcon = isPublic ? Globe : Share2

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm',
            isPublic
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-line bg-surface text-primary hover:bg-[color-mix(in_srgb,var(--text-muted)_8%,transparent)]',
          )}
        >
          <TriggerIcon className="h-3.5 w-3.5" />
          {triggerLabel}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-0 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 dark:bg-[#1A1A24]">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-white/10">
            <Dialog.Title className="text-base font-semibold text-neutral-900 dark:text-white">
              Share recording
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:text-gray-400 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tab strip */}
          <div className="flex gap-1 border-b border-neutral-200 px-3 py-2 dark:border-white/10">
            <TabButton active={tab === 'link'} onClick={() => setTab('link')}>
              Share link
            </TabButton>
            <TabButton active={tab === 'invite'} onClick={() => setTab('invite')}>
              Invite
            </TabButton>
          </div>

          {tab === 'link' && (
            <ShareLinkTab
              isPublic={isPublic}
              shareUrl={shareUrl}
              perms={perms}
              expiryDays={expiryDays}
              onPermsChange={setPerms}
              onExpiryChange={setExpiryDays}
              onToggleSharing={toggleSharing}
              onSave={saveSettings}
              onCopy={copyLink}
              copied={copied}
              busy={makePublic.isPending || makePrivate.isPending}
            />
          )}

          {tab === 'invite' && (
            <InviteTab recordingId={recordingId} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Tab button ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-[#CA2625] text-white'
          : 'text-neutral-600 hover:bg-neutral-100 dark:text-gray-400 dark:hover:bg-white/10',
      )}
    >
      {children}
    </button>
  )
}

// ── Share link tab ─────────────────────────────────────────────────────────

function ShareLinkTab({
  isPublic,
  shareUrl,
  perms,
  expiryDays,
  onPermsChange,
  onExpiryChange,
  onToggleSharing,
  onSave,
  onCopy,
  copied,
  busy,
}: {
  isPublic: boolean
  shareUrl: string
  perms: Permissions
  expiryDays: number | null
  onPermsChange: (p: Permissions) => void
  onExpiryChange: (d: number | null) => void
  onToggleSharing: (next: boolean) => Promise<void>
  onSave: () => Promise<void>
  onCopy: () => void
  copied: boolean
  busy: boolean
}) {
  return (
    <div className="space-y-4 px-5 py-4">
      {/* Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-white/10">
        <div className="flex items-center gap-2">
          {isPublic ? (
            <Globe className="h-4 w-4 text-emerald-600" />
          ) : (
            <Lock className="h-4 w-4 text-neutral-500" />
          )}
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            {isPublic ? 'Anyone with the link can view' : 'Only members can view'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleSharing(!isPublic)}
          disabled={busy}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60',
            isPublic ? 'bg-[#CA2625]' : 'bg-neutral-300 dark:bg-white/15',
          )}
          aria-pressed={isPublic}
          aria-label="Toggle public sharing"
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
              isPublic ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      {/* Link + copy */}
      {isPublic && shareUrl && (
        <div className="flex items-stretch overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/5">
          <code className="flex-1 truncate px-3 py-2 font-mono text-xs text-neutral-700 dark:text-gray-200">
            {shareUrl}
          </code>
          <button
            type="button"
            onClick={onCopy}
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
      )}

      {/* Permissions */}
      <div className="rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-white/10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-gray-400">
          View permissions
        </p>
        <div className="space-y-1.5">
          <PermCheckbox
            checked={perms.summary}
            onChange={(v) => onPermsChange({ ...perms, summary: v })}
            label="Summary"
          />
          <PermCheckbox
            checked={perms.transcript}
            onChange={(v) => onPermsChange({ ...perms, transcript: v })}
            label="Transcript"
          />
          <PermCheckbox
            checked={perms.actionItems}
            onChange={(v) => onPermsChange({ ...perms, actionItems: v })}
            label="Action items"
          />
        </div>
      </div>

      {/* Expiry */}
      <div className="rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-white/10">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-gray-400">
          Link expires
        </label>
        <select
          value={expiryDays ?? ''}
          onChange={(e) =>
            onExpiryChange(e.target.value === '' ? null : Number(e.target.value))
          }
          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          {EXPIRY_PRESETS.map((p) => (
            <option key={p.label} value={p.days ?? ''}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {isPublic && (
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="w-full rounded-lg bg-[#CA2625] py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b21f1f] disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      )}
    </div>
  )
}

function PermCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800 dark:text-gray-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-neutral-300 text-[#CA2625] focus:ring-[#CA2625]"
      />
      <span>{label}</span>
    </label>
  )
}

// ── Invite tab ─────────────────────────────────────────────────────────────

function InviteTab({ recordingId }: { recordingId: string }) {
  const utils = trpc.useUtils()
  const { data: invites } = trpc.recordings.listShareInvites.useQuery({
    recordingId,
  })
  const add = trpc.recordings.addShareInvite.useMutation({
    onSuccess: () => utils.recordings.listShareInvites.invalidate({ recordingId }),
  })
  const remove = trpc.recordings.removeShareInvite.useMutation({
    onSuccess: () => utils.recordings.listShareInvites.invalidate({ recordingId }),
  })

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) return
    try {
      await add.mutateAsync({ recordingId, email: email.trim() })
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add invite.')
    }
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        Note: invitee emails are saved here for record-keeping. The share link
        itself is currently open to anyone who has it — email-gated access is
        coming in a follow-up.
      </p>

      <form onSubmit={submit} className="flex items-stretch gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-neutral-300 bg-white px-2.5 dark:border-white/10 dark:bg-white/5">
          <Mail className="h-3.5 w-3.5 text-neutral-400" />
          <input
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent py-2 text-sm focus:outline-none dark:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={add.isPending}
          className="rounded-md bg-[#CA2625] px-3 py-2 text-xs font-semibold text-white hover:bg-[#b21f1f] disabled:opacity-60"
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        {invites && invites.length === 0 && (
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            No invites yet.
          </p>
        )}
        {invites && invites.length > 0 && (
          <ul className="space-y-1.5">
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 dark:bg-white/5 dark:text-gray-200"
              >
                <span className="truncate">{i.email}</span>
                <button
                  type="button"
                  onClick={() => remove.mutate({ id: i.id })}
                  className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  title="Remove invite"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function getOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}
