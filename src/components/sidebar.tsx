'use client'

// Kolasys AI — Fireflies-style collapsible sidebar.
// Pure white in light mode, dark surface in dark mode. State persists to
// localStorage['kolasys-sidebar-collapsed']. Hidden on mobile — MobileNav
// handles < lg viewports.

import { useEffect, useState } from 'react'
import {
  UserButton,
  OrganizationSwitcher,
} from '@clerk/nextjs'
import {
  BarChart2,
  Brain,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  Mic2,
  Plug,
  Scissors,
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

// Thin, Fireflies-weight icon props applied across the nav.
const ICON = 'h-[18px] w-[18px]'
const STROKE = 1.75

export function CollapsibleSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  // `mounted` gates the width transition on first paint — avoids an
  // animated width flash if the user had saved `collapsed=true` last session.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true')
    } catch {
      /* storage blocked — use default */
    }
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
        'hidden flex-shrink-0 flex-col border-r lg:flex',
        'bg-white dark:bg-[#1A1A24]',
        'border-neutral-100 dark:border-white/10',
        collapsed ? 'w-16' : 'w-60',
        mounted && 'transition-[width] duration-200 ease-in-out',
      )}
    >
      {/* ── Brand + collapse toggle ─────────────────────────────────── */}
      <div
        className={cn(
          'flex h-16 items-center border-b',
          'border-neutral-100 dark:border-white/10',
          collapsed ? 'flex-col justify-center gap-1 px-0' : 'justify-between gap-2 px-4',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-neutral-50 dark:hover:bg-white/5"
        >
          <KolasysLogoMark
            size={collapsed ? 40 : 34}
            className="flex-shrink-0 text-black dark:text-white"
          />
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-neutral-900 transition-opacity duration-200 dark:text-white">
              Kolasys <span style={{ color: '#CA2625' }}>AI</span>
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-white',
            collapsed && 'mt-1',
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" strokeWidth={STROKE} /> : <ChevronLeft className="h-4 w-4" strokeWidth={STROKE} />}
        </button>
      </div>

      {/* ── Org switcher — hidden when collapsed ────────────────────── */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          collapsed
            ? 'h-0 opacity-0'
            : 'border-b border-neutral-100 px-4 py-3 opacity-100 dark:border-white/10',
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
                'w-full rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-white/5 justify-start gap-2',
              avatarBox:
                'w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center',
              organizationPreviewMainIdentifier: 'text-sm font-semibold text-neutral-900 dark:text-white',
              organizationPreviewSecondaryIdentifier: 'text-xs text-neutral-500 dark:text-gray-400',
            },
          }}
        />
      </div>

      {/* ── Nav — 3 groups per spec, divider between each ───────────── */}
      <nav
        className={cn(
          'flex flex-1 flex-col gap-0.5 py-2',
          collapsed ? 'items-center px-1' : 'px-2',
        )}
      >
        {/* Group 1 — day-to-day */}
        <DashboardNavLink
          href="/dashboard"
          icon={<LayoutDashboard className={ICON} strokeWidth={STROKE} />}
          label="Overview"
          exact
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/recordings"
          icon={<Mic2 className={ICON} strokeWidth={STROKE} />}
          label="Recordings"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/action-items"
          icon={<ListChecks className={ICON} strokeWidth={STROKE} />}
          label="Action Items"
          collapsed={collapsed}
        />

        <div className="my-1 w-full border-t border-neutral-100 dark:border-white/10" aria-hidden />

        {/* Group 2 — intelligence */}
        <DashboardNavLink
          href="/dashboard/analytics"
          icon={<BarChart2 className={ICON} strokeWidth={STROKE} />}
          label="Analytics"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/contacts"
          icon={<Users className={ICON} strokeWidth={STROKE} />}
          label="Contacts"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/knowledge"
          icon={<Brain className={ICON} strokeWidth={STROKE} />}
          label="Knowledge"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/search"
          icon={<Sparkles className={ICON} strokeWidth={STROKE} />}
          label="Ask AI"
          collapsed={collapsed}
        />

        <div className="my-1 w-full border-t border-neutral-100 dark:border-white/10" aria-hidden />

        {/* Group 3 — scheduling + admin */}
        <DashboardNavLink
          href="/dashboard/soundbites"
          icon={<Scissors className={ICON} strokeWidth={STROKE} />}
          label="Soundbites"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/calendar"
          icon={<Calendar className={ICON} strokeWidth={STROKE} />}
          label="Calendar"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/settings/templates"
          icon={<Wand2 className={ICON} strokeWidth={STROKE} />}
          label="Templates"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/settings"
          icon={<Settings className={ICON} strokeWidth={STROKE} />}
          label="Settings"
          exact
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/billing"
          icon={<CreditCard className={ICON} strokeWidth={STROKE} />}
          label="Billing"
          collapsed={collapsed}
        />
        <DashboardNavLink
          href="/dashboard/settings/integrations"
          icon={<Plug className={ICON} strokeWidth={STROKE} />}
          label="Integrations"
          collapsed={collapsed}
        />
      </nav>

      {/* ── Bottom: theme toggle ─────────────────────────────────────── */}
      <div
        className={cn(
          'flex border-t p-3',
          'border-neutral-100 dark:border-white/10',
          collapsed ? 'flex-col items-center' : 'flex-col',
        )}
      >
        <div className={collapsed ? '' : 'w-full'}>
          <DarkModeToggle compact={collapsed} />
        </div>
      </div>

      {/* ── Bottom: user avatar ──────────────────────────────────────
         Rendered bare — no gradient ring, no auxiliary wrappers — so the
         Clerk button stays the width of its avatar rather than stretching
         to fill the sidebar. */}
      <div className="flex items-center justify-center border-t border-neutral-100 p-4 dark:border-white/10">
        <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }} />
      </div>
    </aside>
  )
}
