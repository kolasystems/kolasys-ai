'use client'

// Kolasys AI — Bulk "Name Speakers" modal

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Users, X, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Props = {
  recordingId: string
  speakerIds: string[] // unique speaker identifiers currently used in segments
  speakerLabels: { speakerId: string; displayName: string }[]
  triggerClassName?: string
}

export function NameSpeakersModal({
  recordingId,
  speakerIds,
  speakerLabels,
  triggerClassName,
}: Props) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)

  const labelMap = useMemo(
    () => Object.fromEntries(speakerLabels.map((l) => [l.speakerId, l.displayName])),
    [speakerLabels]
  )

  // Working copy of names, keyed by original speaker id.
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    // Reset the working copy each time the modal opens.
    const initial: Record<string, string> = {}
    for (const id of speakerIds) {
      initial[id] = labelMap[id] ?? id
    }
    setNames(initial)
  }, [open, speakerIds, labelMap])

  const mutation = trpc.recordings.nameSpeakers.useMutation({
    onSuccess: async () => {
      await utils.recordings.get.invalidate({ id: recordingId })
      await utils.recordings.listTranscriptSegments.invalidate()
      await utils.recordings.listSpeakerLabels.invalidate({ recordingId })
      setOpen(false)
      router.refresh()
    },
  })

  function handleSave() {
    const mappings = speakerIds
      .map((id) => {
        const to = (names[id] ?? '').trim()
        const from = id
        if (!to || to === from) return null
        // If the current display name equals the input, still skip.
        if (labelMap[id] === to) return null
        return { from, to }
      })
      .filter((m): m is { from: string; to: string } => m !== null)

    if (mappings.length === 0) {
      setOpen(false)
      return
    }
    mutation.mutate({ recordingId, speakerMappings: mappings })
  }

  const hasChanges = speakerIds.some((id) => {
    const next = (names[id] ?? '').trim()
    const current = labelMap[id] ?? id
    return next && next !== current
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={
            triggerClassName ??
            'flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50'
          }
        >
          <Users className="h-3.5 w-3.5" />
          Name speakers
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold text-neutral-900">
              Name speakers
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 transition-colors hover:bg-neutral-100">
                <X className="h-4 w-4 text-neutral-500" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-sm text-neutral-600">
            Replace diarization labels like <code className="rounded bg-neutral-100 px-1">SPEAKER_0</code> with
            real names. This updates the transcript in place.
          </Dialog.Description>

          <div className="mt-5 space-y-3">
            {speakerIds.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500">
                No speakers were detected in this recording.
              </p>
            ) : (
              speakerIds.map((id) => (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-24 flex-shrink-0 font-mono text-xs text-neutral-500">
                    {id}
                  </span>
                  <input
                    type="text"
                    value={names[id] ?? ''}
                    onChange={(e) => setNames({ ...names, [id]: e.target.value })}
                    placeholder="e.g. Jane Smith"
                    className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              ))
            )}
          </div>

          {mutation.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {mutation.error.message}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
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
              onClick={handleSave}
              disabled={mutation.isPending || !hasChanges}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save names
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
