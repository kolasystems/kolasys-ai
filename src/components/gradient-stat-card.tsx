// Kolasys AI — Gradient glass stat card with animated counter.
// Server component: lets the parent dashboard pass `icon={Mic2}` (a function
// reference) directly without crossing the RSC boundary. The counter inside
// is a separate client component — that's fine, server components can render
// client components, and `value: number` serialises cleanly.

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatedCounter } from './animated-counter'

export type StatVariant = 'recordings' | 'notes' | 'actionitems' | 'checkins'

const variantClass: Record<StatVariant, string> = {
  recordings:  'stat-gradient-recordings',
  notes:       'stat-gradient-notes',
  actionitems: 'stat-gradient-actionitems',
  checkins:    'stat-gradient-checkins',
}

type Props = {
  href?: string
  variant: StatVariant
  icon: LucideIcon
  label: string
  value: number
  /**
   * Optional string override. When provided, replaces the AnimatedCounter
   * so a card can display a pre-formatted value like "3h 24m" without
   * losing the gradient + lift treatment.
   */
  displayValue?: string
}

export function GradientStatCard({ href, variant, icon: Icon, label, value, displayValue }: Props) {
  const content = (
    <div
      className={cn(
        'stat-inner-glow stat-lift relative overflow-hidden rounded-2xl p-5 text-white shadow-lg',
        variantClass[variant],
      )}
    >
      {/* Content above the inner-glow pseudo element */}
      <div className="relative z-10 flex items-center gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-3xl font-bold tabular-nums leading-none">
            {displayValue ?? <AnimatedCounter value={value} />}
          </p>
          <p className="mt-1.5 text-xs font-medium uppercase tracking-wider text-white/80">
            {label}
          </p>
        </div>
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none">
        {content}
      </Link>
    )
  }
  return content
}
