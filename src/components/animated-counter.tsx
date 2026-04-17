'use client'

// Kolasys AI — Animated integer counter.
// Tweens from 0 to `value` over `duration` ms on mount; re-animates if the
// target changes. Respects users who opt out of motion.

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  duration?: number // ms
  className?: string
}

export function AnimatedCounter({ value, duration = 900, className }: Props) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // Respect reduced-motion preference.
    if (typeof window !== 'undefined') {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) {
        setDisplay(value)
        return
      }
    }

    const start = performance.now()
    const from = 0
    const to = value

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration)
      // Ease-out cubic for a snappy landing.
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return <span className={className}>{display.toLocaleString()}</span>
}
