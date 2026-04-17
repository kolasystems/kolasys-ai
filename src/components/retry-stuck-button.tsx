'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Props = {
  recordingId: string
  size?: 'sm' | 'md'
  className?: string
}

export function RetryStuckButton({ recordingId, size = 'md', className }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)

  const mutation = trpc.recordings.retryStuck.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setMessage(null)
        router.refresh()
      } else if (data.reason) {
        setMessage(data.reason)
      }
    },
    onError: (err) => setMessage(err.message),
  })

  const padding = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage(null)
          mutation.mutate({ recordingId })
        }}
        disabled={mutation.isPending}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 ${padding} ${className ?? ''}`}
      >
        <RotateCw className={`${size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} ${mutation.isPending ? 'animate-spin' : ''}`} />
        {mutation.isPending ? 'Retrying…' : 'Retry transcription'}
      </button>
      {message && (
        <p className="mt-1 text-xs text-red-600">{message}</p>
      )}
    </>
  )
}
