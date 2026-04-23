'use client'

// Kolasys AI — Nav link with path-aware active state + collapsed/expanded
// rendering for the Fireflies-style collapsible sidebar.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'

type Props = {
  href: string
  icon: React.ReactNode
  label: string
  onNavigate?: () => void
  /** Exact-match on `href`, otherwise activates when pathname starts with `href`. */
  exact?: boolean
  /** When true the nav link renders icon-only + tooltip; when false it
   *  renders icon + label inline (the expanded sidebar layout). */
  collapsed?: boolean
}

// Shared active-state palette. 8% accent tint on the background reads as a
// very subtle lavender/red pill (Fireflies style) without the old left-bar
// emphasis. Brand-red for icon + label keeps the hierarchy readable.
const ACTIVE_BG =
  'bg-[color-mix(in_srgb,#CA2625_8%,transparent)] dark:bg-[color-mix(in_srgb,#CA2625_14%,transparent)]'

export function DashboardNavLink({
  href,
  icon,
  label,
  onNavigate,
  exact,
  collapsed = false,
}: Props) {
  const pathname = usePathname() ?? ''
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? undefined : label}
      className={cn(
        'relative flex min-h-[44px] items-center rounded-lg text-sm transition-all duration-200',
        collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2.5',
        active
          ? cn(ACTIVE_BG, 'font-medium text-[#CA2625]')
          : 'font-medium text-secondary hover:bg-[color-mix(in_srgb,var(--text-muted)_8%,transparent)] hover:text-primary',
      )}
    >
      <span className={cn(active ? 'text-[#CA2625]' : 'text-muted')}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </Link>
  )

  // Tooltip is disabled (no-op) when expanded — labels are already visible inline.
  return (
    <Tooltip label={label} disabled={!collapsed}>
      {link}
    </Tooltip>
  )
}
