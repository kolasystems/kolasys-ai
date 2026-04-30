'use client'

// Kolasys AI — Soundbite capture overlay. Wraps the transcript area; when
// the user selects text whose first/last DOM elements carry `data-sb-start`
// / `data-sb-end` attributes, a small floating "Create soundbite" button
// appears near the selection. Clicking it prompts for a title and creates
// the soundbite via tRPC.

import { useEffect, useRef, useState } from 'react'
import { Scissors } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type SelectionRange = {
  startSeconds: number
  endSeconds: number
  text: string
  // Position of the floating button near the end of the selection, in
  // viewport-relative coordinates.
  x: number
  y: number
}

export function SoundbiteCapture({
  recordingId,
  children,
}: {
  recordingId: string
  children: React.ReactNode
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<SelectionRange | null>(null)
  const [busy, setBusy] = useState(false)

  const utils = trpc.useUtils()
  const createSoundbite = trpc.soundbites.create.useMutation({
    onSuccess: () => {
      utils.soundbites.list.invalidate()
    },
  })

  // Watch the document selection. We treat any selection that begins and
  // ends inside our wrapper as a candidate. The boundaries' nearest
  // `[data-sb-start]` / `[data-sb-end]` ancestors give us the time range.
  useEffect(() => {
    function handleSelection() {
      const wrapper = wrapperRef.current
      if (!wrapper) return

      const selection = window.getSelection?.()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setRange(null)
        return
      }

      const r = selection.getRangeAt(0)
      // Reject selections that escape our wrapper.
      if (
        !wrapper.contains(r.startContainer) ||
        !wrapper.contains(r.endContainer)
      ) {
        setRange(null)
        return
      }

      const startEl = nearestWithAttr(r.startContainer, 'data-sb-start')
      const endEl = nearestWithAttr(r.endContainer, 'data-sb-end')
      if (!startEl || !endEl) {
        setRange(null)
        return
      }

      const startSeconds = Number(startEl.getAttribute('data-sb-start'))
      const endSecondsRaw = Number(endEl.getAttribute('data-sb-end'))
      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSecondsRaw)) {
        setRange(null)
        return
      }
      const endSeconds = Math.max(endSecondsRaw, startSeconds + 0.5)

      const text = selection.toString().trim().slice(0, 4000)
      if (!text) {
        setRange(null)
        return
      }

      const rect = r.getBoundingClientRect()
      setRange({
        startSeconds,
        endSeconds,
        text,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      })
    }

    document.addEventListener('selectionchange', handleSelection)
    return () => document.removeEventListener('selectionchange', handleSelection)
  }, [])

  async function handleCreate() {
    if (!range) return
    const defaultTitle = range.text.slice(0, 80)
    const title = window.prompt('Soundbite title', defaultTitle)
    if (!title) return

    try {
      setBusy(true)
      await createSoundbite.mutateAsync({
        recordingId,
        title: title.slice(0, 200),
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        transcript: range.text,
      })
      // Clear DOM selection + local state so the chip disappears.
      window.getSelection?.()?.removeAllRanges()
      setRange(null)
    } catch (err) {
      console.error('[soundbite-capture] create failed:', err)
      window.alert(
        err instanceof Error ? err.message : 'Could not create soundbite.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      {children}
      {range && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          // The button is positioned in viewport-relative coords; using
          // `position: fixed` keeps it pinned even as the transcript scrolls.
          style={{
            position: 'fixed',
            left: `${range.x}px`,
            top: `${range.y}px`,
            transform: 'translateX(-50%)',
            zIndex: 50,
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#CA2625] px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-[#b21f1f] disabled:opacity-60"
        >
          <Scissors className="h-3 w-3" />
          {busy ? 'Saving…' : 'Create soundbite'}
        </button>
      )}
    </div>
  )
}

function nearestWithAttr(node: Node, attr: string): Element | null {
  let cur: Node | null = node
  while (cur) {
    if (cur.nodeType === Node.ELEMENT_NODE && (cur as Element).hasAttribute(attr)) {
      return cur as Element
    }
    cur = cur.parentNode
  }
  return null
}
