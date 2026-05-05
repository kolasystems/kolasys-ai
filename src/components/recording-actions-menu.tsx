'use client'

// Kolasys AI — Recording detail "..." menu
// Hosts the Re-transcribe and Find & Replace modals.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, X, RefreshCw, Search as SearchIcon, Loader2, Wand2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Props = {
  recordingId: string
  hasTranscript: boolean
  canRetranscribe: boolean // s3Key still set on the recording
}

type ActiveModal = null | 'retranscribe' | 'findReplace'

export function RecordingActionsMenu({ recordingId, hasTranscript, canRetranscribe }: Props) {
  const router = useRouter()
  const [active, setActive] = useState<ActiveModal>(null)
  const [titleStatus, setTitleStatus] = useState<string | null>(null)

  const regenerateTitle = trpc.recordings.regenerateTitle.useMutation({
    onSuccess: () => {
      setTitleStatus(null)
      router.refresh()
    },
    onError: (err) => setTitleStatus(err.message),
  })

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label="More actions"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </Dropdown.Trigger>

        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[220px] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg focus:outline-none"
          >
            <Dropdown.Item
              disabled={!hasTranscript || regenerateTitle.isPending}
              onSelect={(e) => {
                e.preventDefault()
                setTitleStatus(null)
                regenerateTitle.mutate({ recordingId })
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
            >
              {regenerateTitle.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
              ) : (
                <Wand2 className="h-4 w-4 text-[#CA2625]" />
              )}
              <div className="flex-1">
                <p className="font-medium">Regenerate title</p>
                <p className="text-xs text-neutral-500">
                  {hasTranscript ? 'Re-summarise into a fresh title' : 'Needs a transcript first'}
                </p>
              </div>
            </Dropdown.Item>

            <Dropdown.Item
              disabled={!canRetranscribe}
              onSelect={(e) => { e.preventDefault(); setActive('retranscribe') }}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
            >
              <RefreshCw className="h-4 w-4 text-neutral-500" />
              <div className="flex-1">
                <p className="font-medium">Re-transcribe</p>
                <p className="text-xs text-neutral-500">
                  {canRetranscribe ? 'Run Whisper again' : 'Original audio no longer available'}
                </p>
              </div>
            </Dropdown.Item>

            <Dropdown.Item
              disabled={!hasTranscript}
              onSelect={(e) => { e.preventDefault(); setActive('findReplace') }}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
            >
              <SearchIcon className="h-4 w-4 text-neutral-500" />
              <div className="flex-1">
                <p className="font-medium">Find &amp; Replace</p>
                <p className="text-xs text-neutral-500">Update words in the transcript</p>
              </div>
            </Dropdown.Item>

            {titleStatus && (
              <p className="px-3 py-1.5 text-[11px] text-red-600">{titleStatus}</p>
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      <RetranscribeModal
        open={active === 'retranscribe'}
        onOpenChange={(o) => setActive(o ? 'retranscribe' : null)}
        recordingId={recordingId}
      />
      <FindReplaceModal
        open={active === 'findReplace'}
        onOpenChange={(o) => setActive(o ? 'findReplace' : null)}
        recordingId={recordingId}
      />
    </>
  )
}

// ─── Re-transcribe modal ─────────────────────────────────────────────────────

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
]

function RetranscribeModal({
  open,
  onOpenChange,
  recordingId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  recordingId: string
}) {
  const router = useRouter()
  const [language, setLanguage] = useState('en')
  const [quality, setQuality] = useState<'standard' | 'high'>('standard')

  const mutation = trpc.recordings.retranscribe.useMutation({
    onSuccess: () => {
      onOpenChange(false)
      router.refresh()
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold text-neutral-900">
              Re-transcribe recording
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 transition-colors hover:bg-neutral-100">
                <X className="h-4 w-4 text-neutral-500" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-sm text-neutral-600">
            Wipe the current transcript and run Whisper again with different settings.
            The original audio must still be available.
          </Dialog.Description>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Quality
              </label>
              <div className="grid grid-cols-2 gap-2">
                <QualityRadio
                  value="standard"
                  current={quality}
                  onChange={setQuality}
                  title="Standard"
                  subtitle="Faster · segment timestamps"
                />
                <QualityRadio
                  value="high"
                  current={quality}
                  onChange={setQuality}
                  title="High"
                  subtitle="Slower · word-level accuracy"
                />
              </div>
            </div>

            {mutation.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {mutation.error.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() =>
                  mutation.mutate({ recordingId, language, quality })
                }
                disabled={mutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Re-transcribe
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function QualityRadio({
  value,
  current,
  onChange,
  title,
  subtitle,
}: {
  value: 'standard' | 'high'
  current: 'standard' | 'high'
  onChange: (v: 'standard' | 'high') => void
  title: string
  subtitle: string
}) {
  const selected = value === current
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={
        'rounded-lg border px-3 py-2 text-left transition-colors ' +
        (selected
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50')
      }
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>
    </button>
  )
}

// ─── Find & Replace modal ────────────────────────────────────────────────────

function FindReplaceModal({
  open,
  onOpenChange,
  recordingId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  recordingId: string
}) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [wholeWord, setWholeWord] = useState(false)

  const preview = trpc.recordings.previewFindReplace.useQuery(
    { recordingId, find, wholeWord },
    { enabled: open && find.length > 0, staleTime: 0 }
  )

  const mutation = trpc.recordings.findReplaceTranscript.useMutation({
    onSuccess: async () => {
      setFind('')
      setReplace('')
      await utils.recordings.get.invalidate({ id: recordingId })
      await utils.recordings.listTranscriptSegments.invalidate()
      onOpenChange(false)
      router.refresh()
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold text-neutral-900">
              Find &amp; Replace
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 transition-colors hover:bg-neutral-100">
                <X className="h-4 w-4 text-neutral-500" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-sm text-neutral-600">
            Update every occurrence of a word or phrase in the transcript.
            Matching is case-insensitive.
          </Dialog.Description>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Find</label>
              <input
                type="text"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="e.g. Whisper"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Replace with
              </label>
              <input
                type="text"
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder="Leave blank to delete the term"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="rounded border-neutral-300"
              />
              Match whole words only
            </label>

            {find && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                {preview.isLoading
                  ? 'Counting matches…'
                  : preview.data
                  ? `${preview.data.occurrences} occurrence${preview.data.occurrences === 1 ? '' : 's'} across ${preview.data.segments} segment${preview.data.segments === 1 ? '' : 's'}.`
                  : 'Start typing to preview matches.'}
              </div>
            )}

            {mutation.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {mutation.error.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() =>
                  mutation.mutate({ recordingId, find, replace, wholeWord })
                }
                disabled={
                  mutation.isPending ||
                  find.length === 0 ||
                  (preview.data?.occurrences ?? 0) === 0
                }
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Replace All
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
