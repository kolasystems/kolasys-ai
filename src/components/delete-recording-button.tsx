'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Trash2, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

export function DeleteRecordingButton({ recordingId }: { recordingId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const deleteMutation = trpc.recordings.delete.useMutation({
    onSuccess: () => router.push('/dashboard/recordings'),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold text-neutral-900">
              Delete recording?
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 transition-colors hover:bg-neutral-100">
                <X className="h-4 w-4 text-neutral-500" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-sm text-neutral-600">
            This will permanently delete the recording, its transcript, all generated notes,
            action items, and the audio file from storage. This cannot be undone.
          </Dialog.Description>

          {deleteMutation.error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteMutation.error.message}
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
              onClick={() => deleteMutation.mutate({ id: recordingId })}
              disabled={deleteMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Recording'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
