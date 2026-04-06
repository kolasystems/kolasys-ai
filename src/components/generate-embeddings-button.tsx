'use client'

// Kolasys AI — Generate embeddings button for the recording detail page.
// Triggers embedding generation and shows progress.

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Database, Loader2, CheckCircle2 } from 'lucide-react'

type Props = {
  recordingId: string
}

export function GenerateEmbeddingsButton({ recordingId }: Props) {
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<{ stored: number; total: number } | null>(null)

  const mutation = trpc.search.generateEmbeddings.useMutation({
    onSuccess: (data) => {
      setDone(true)
      setResult(data)
    },
  })

  if (done && result) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Indexed ({result.stored} chunks)
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => mutation.mutate({ recordingId })}
      disabled={mutation.isPending}
      title="Generate embeddings to enable Ask AI semantic search"
      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-50"
    >
      {mutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Database className="h-3.5 w-3.5" />
      )}
      {mutation.isPending ? 'Indexing…' : 'Index for AI'}
    </button>
  )
}
