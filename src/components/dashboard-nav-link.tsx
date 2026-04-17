'use client'

// Kolasys AI — Nav link with path-aware active state.
// Client component so we can read the current pathname without a server round
// trip and apply the glass-effect active state + accent left border.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type Props = {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  onNavigate?: () => void
  /** Exact-match on `href`, otherwise activates when pathname starts with `href`. */
  exact?: boolean
}

export function DashboardNavLink({ href, icon, children, onNavigate, exact }: Props) {
  const pathname = usePathname() ?? ''
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
        active
          ? 'glass-subtle text-primary shadow-sm'
          : 'text-secondary hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)] hover:text-primary',
      )}
    >
      {/* Accent left border on active */}
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent"
          style={{ boxShadow: '0 0 12px var(--accent)' }}
        />
      )}
      <span className={cn(active ? 'text-accent' : 'text-muted')}>{icon}</span>
      {children}
    </Link>
  )
}
