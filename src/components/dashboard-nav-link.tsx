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
        'relative flex min-h-[44px] items-center rounded-lg text-sm font-medium transition-all duration-200',
        collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2',
        active
          ? 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[#CA2625]'
          : 'text-secondary hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)] hover:text-primary',
      )}
    >
      {/* Accent left bar on the expanded-active state */}
      {active && !collapsed && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#CA2625]"
          style={{ boxShadow: '0 0 12px #CA2625' }}
        />
      )}
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
