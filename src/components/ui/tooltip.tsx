'use client'

// Kolasys AI — Minimal hover tooltip used by the collapsed sidebar.
// Rendered into document.body via createPortal so it escapes any ancestor
// `overflow` clipping (the nav has overflow-y-auto which would otherwise
// clip the tooltip that pops out to the right).

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  children: React.ReactNode
  label: string
  /** When true, the tooltip is a no-op — use this when the sidebar is
   *  expanded so nav labels are already visible inline. */
  disabled?: boolean
}

export function Tooltip({ children, label, disabled }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  // Compute the tooltip's viewport position whenever it becomes visible.
  useLayoutEffect(() => {
    if (!show || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setCoords({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    })
  }, [show])

  if (disabled) return <>{children}</>

  return (
    <div
      ref={anchorRef}
      className="relative flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && coords && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: coords.top, left: coords.left, transform: 'translateY(-50%)' }}
            className="pointer-events-none fixed z-[100] whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-neutral-700"
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  )
}
