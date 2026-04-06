'use client'

// Polls the server every 3 s while the recording is in a non-terminal state
// by calling router.refresh() — this re-runs the parent server component and
// updates all data without requiring a client-side query duplicate.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const TERMINAL = new Set(['READY', 'FAILED'])

export function RecordingStatusPoller({ status }: { status: string }) {
  const router = useRouter()

  useEffect(() => {
    if (TERMINAL.has(status)) return
    const id = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(id)
  }, [status, router])

  return null
}
