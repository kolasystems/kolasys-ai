'use client'

// Kolasys AI — Fireflies-style collapsible sidebar.
// Collapsed (w-16): icon-only with hover tooltips; Expanded (w-60): full
// labels + org switcher. Toggle state persists to
// localStorage['kolasys-sidebar-collapsed'].
// Hidden on mobile — MobileNav handles < lg viewports.

import { useEffect, useState } from 'react'
import {
  UserButton,
  OrganizationSwitcher,
} from '@clerk/nextjs'
import {
  BarChart2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  Mic2,
  Plug,
  Settings,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DashboardNavLink } from '@/components/dashboard-nav-link'
import { DarkModeToggle } from '@/components/dark-mode-toggle'
import { KolasysLogoMark } from '@/components/kolasys-logo'

const STORAGE_KEY = 'kolasys-sidebar-collapsed'

export function CollapsibleSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  // `mounted` gates the width transition on first paint — avoids an
  // animated width flash if the user had saved `collapsed=true` last session.
  // (We can't read localStorage during SSR, so the server always renders the
  // expanded state; after mount we sync to the stored value.)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true')
    } catch {
      /* storage blocked — use default */
    }
    // Defer enabling the width transition by a frame so the initial width
    // snap (if we had to flip to collapsed) isn't animated.
    requestAnimationFrame(() => setMounted(true))
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        /* noop */
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'hidden flex-shrink-0 flex-col border-r border-line bg-sidebar-gradient lg:flex',
        collapsed ? 'w-16' : 'w-60',
        mounted && 'transition-[width] duration-200 ease-in-out',
      )}
    >
      {/* ── Brand + collapse toggle ─────────────────────────────────── */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-line',
          collapsed ? 'flex-col justify-center gap-1 px-0' : 'justify-between gap-2 px-4',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]"
        >
          <KolasysLogoMark
            size={collapsed ? 24 : 28}
            className="flex-shrink-0 text-black dark:text-white"
          />
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-primary transition-opacity duration-200">
              Kolasys <span style={{ color: '#CA2625' }}>AI</span>
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)] hover:text-primary',
            collapsed && 'mt-1',
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* ── Org switcher — hidden when collapsed ────────────────────── */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          collapsed
            ? 'h-0 opacity-0'
            : 'border-b border-line px-4 py-3 opacity-100',
        )}
      >
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: 'w-full',
              organizationSwitcherTrigger:
                'w-full rounded-lg px-2 py-1.5 text-sm hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)] justify-start gap-2',
              avatarBox:
                'w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center',
              organizationPreviewMainIdentifier: 'text-sm font-semibold text-primary',
              organizationPreviewSecondaryIdentifier: 'text-xs text-secondary',
            },
          }}
        />
      </div>

      {/* ── Nav — three groups separated by dividers ────────────────── */}
      <nav
        className={cn(
          'flex flex-1 flex-col gap-0.5 py-2',
          collapsed ? 'items-center px-1' : 'px-2',
        )}
      >
        {/* Group 1 — main */}
        <DashboardNavLink
          href="/dashboard"
          icon={<LayoutDashboard className="h-4 w-4" />}
          label="Overview"
          exact
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/recordings"
          icon={<Mic2 className="h-4 w-4" />}
          label="Recordings"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/action-items"
          icon={<ListChecks className="h-4 w-4" />}
          label="Action Items"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/analytics"
          icon={<BarChart2 className="h-4 w-4" />}
          label="Analytics"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/contacts"
          icon={<Users className="h-4 w-4" />}
          label="Contacts"
          collapsed={collapsed}
        />

        <div className="my-1 w-full border-t border-line" aria-hidden />

        {/* Group 2 — AI / scheduling */}
        <DashboardNavLink
          href="/dashboard/search"
          icon={<Sparkles className="h-4 w-4" />}
          label="Ask AI"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/calendar"
          icon={<Calendar className="h-4 w-4" />}
          label="Calendar"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/settings/templates"
          icon={<Wand2 className="h-4 w-4" />}
          label="Templates"
          collapsed={collapsed}
        />

        <div className="my-1 w-full border-t border-line" aria-hidden />

        {/* Group 3 — admin */}
        <DashboardNavLink
          href="/dashboard/settings"
          icon={<Settings className="h-4 w-4" />}
          label="Settings"
          exact
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/settings/integrations"
          icon={<Plug className="h-4 w-4" />}
          label="Integrations"
          collapsed={collapsed}
        />
      </nav>

      {/* ── Bottom: theme toggle + avatar ───────────────────────────── */}
      <div
        className={cn(
          'flex border-t border-line p-3',
          collapsed ? 'flex-col items-center gap-3' : 'flex-col gap-3',
        )}
      >
        <div className={collapsed ? '' : 'w-full'}>
          <DarkModeToggle compact={collapsed} />
        </div>

        <div
          className="inline-flex flex-shrink-0 rounded-full p-[2px]"
          style={{ background: 'linear-gradient(135deg, #CA2625, #8B1A1A)' }}
        >
          <div className="rounded-full bg-surface p-0.5">
            <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }} />
          </div>
        </div>
      </div>
    </aside>
  )
}
