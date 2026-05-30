'use client'

// Kolasys AI — Per-row "Add to folder" control on the meetings list. Mounts
// as an absolutely-positioned sibling of the row's <Link> (see RecordingRow
// in dashboard/recordings/page.tsx) and stops propagation so clicks never
// navigate into the recording detail page.
//
// Trigger: a small `MoreHorizontal` icon button. The dropdown has a single
// "Add to folder…" item that opens a picker dialog listing the org's
// existing series. Picking one fires `series.addRecording` (idempotent
// upsert on the server) and invalidates `series.list` so the sidebar
// counts update.

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Check, FolderPlus, Layers, Loader2, MoreHorizontal, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

export function AddToFolderButton({ recordingId }: { recordingId: string }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  // Swallow click/pointer events on the trigger and its container so the
  // outer <Link> in RecordingRow never navigates.
  function swallow(e: React.SyntheticEvent) {
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <div onClickCapture={swallow} onPointerDownCapture={swallow}>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label="Row actions"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white/80 text-neutral-500 backdrop-blur transition-colors hover:bg-white hover:text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[180px] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg focus:outline-none dark:border-white/10 dark:bg-[#1A1A24]"
          >
            <Dropdown.Item
              onSelect={(e) => {
                e.preventDefault()
                setPickerOpen(true)
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 dark:text-gray-200 dark:data-[highlighted]:bg-white/10"
            >
              <FolderPlus className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
              Add to folder…
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      <FolderPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        recordingId={recordingId}
      />
    </div>
  )
}

// ── Folder picker dialog ──────────────────────────────────────────────────

function FolderPickerDialog({
  open,
  onOpenChange,
  recordingId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordingId: string
}) {
  const utils = trpc.useUtils()
  const { data: series, isLoading } = trpc.series.list.useQuery(undefined, {
    enabled: open,
    staleTime: 30_000,
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const add = trpc.series.addRecording.useMutation({
    onSuccess: async (_data, vars) => {
      await utils.series.list.invalidate()
      setBusyId(null)
      setDone(vars.seriesId)
    },
    onError: (e) => {
      setBusyId(null)
      setError(e.message)
    },
  })

  function reset() {
    setBusyId(null)
    setDone(null)
    setError(null)
  }

  function pick(seriesId: string) {
    setError(null)
    setDone(null)
    setBusyId(seriesId)
    add.mutate({ seriesId, recordingId })
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
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          // Belt-and-suspenders — without this, click events on the overlay
          // would bubble through the row's Link before Radix dismisses.
          onClickCapture={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
        />
        <Dialog.Content
          onClickCapture={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 dark:bg-[#1A1A24]"
        >
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
              Add to folder
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
            Choose a folder. Adding the same recording twice is a no-op.
          </Dialog.Description>

          <div className="mt-5 max-h-[320px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 px-1 py-3 text-sm text-neutral-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading folders…
              </div>
            ) : !series || series.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-white/10 dark:text-gray-400">
                No folders yet. Create one from the sidebar.
              </p>
            ) : (
              <ul className="space-y-1">
                {series.map((s) => {
                  const isBusy = busyId === s.id
                  const isDone = done === s.id
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={isBusy || isDone}
                        onClick={() => pick(s.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-white/5"
                      >
                        <Layers className="h-4 w-4 flex-shrink-0 text-neutral-400 dark:text-gray-500" />
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="flex-shrink-0 text-xs text-neutral-400 dark:text-gray-500">
                          {s.meetingCount}
                        </span>
                        {isBusy && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                        )}
                        {isDone && (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
