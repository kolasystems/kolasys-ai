// Kolasys AI — Dashboard layout with redesigned glass sidebar + dark mode

import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import {
  UserButton,
  OrganizationSwitcher,
  CreateOrganization,
} from '@clerk/nextjs'
import {
  Mic2,
  LayoutDashboard,
  ListChecks,
  Settings,
  Sparkles,
  Calendar,
  Wand2,
  BarChart2,
} from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { DashboardNavLink } from '@/components/dashboard-nav-link'
import { DarkModeToggle } from '@/components/dark-mode-toggle'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!orgId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-app px-4">
        <div className="mb-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Mic2 className="h-6 w-6 text-accent" />
            <span className="logo-glow text-xl font-semibold tracking-tight text-primary">
              Kolasys AI
            </span>
          </div>
          <p className="text-sm text-secondary">
            Create a workspace to get started. All recordings and notes are
            organised under a workspace.
          </p>
        </div>
        <CreateOrganization
          afterCreateOrganizationUrl="/dashboard"
          appearance={{ elements: { rootBox: 'shadow-lg rounded-2xl overflow-hidden' } }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      {/* ── Desktop sidebar — only visible at lg (1024px+) ───────────────── */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-line bg-sidebar-gradient lg:flex">
        {/* Brand — Mic2 in gradient container + glowing wordmark */}
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] p-1.5 shadow-sm">
            <Mic2 className="h-5 w-5 text-white" />
          </div>
          <span className="logo-glow text-sm font-semibold tracking-tight text-primary">
            Kolasys AI
          </span>
        </div>

        {/* Org switcher — avatar square styled as a gradient badge */}
        <div className="border-b border-line px-4 py-3">
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

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <DashboardNavLink href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} exact>
            Overview
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/recordings" icon={<Mic2 className="h-4 w-4" />}>
            Recordings
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/action-items" icon={<ListChecks className="h-4 w-4" />}>
            Action Items
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/analytics" icon={<BarChart2 className="h-4 w-4" />}>
            Analytics
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/search" icon={<Sparkles className="h-4 w-4" />}>
            Ask AI
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/calendar" icon={<Calendar className="h-4 w-4" />}>
            Calendar
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />} exact>
            Settings
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/settings/templates" icon={<Wand2 className="h-4 w-4" />}>
            Templates
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/settings/integrations" icon={<Settings className="h-4 w-4" />}>
            Integrations
          </DashboardNavLink>
        </nav>

        {/* Dark mode toggle */}
        <div className="border-t border-line p-3">
          <DarkModeToggle />
        </div>

        {/* User avatar with gradient ring */}
        <div className="border-t border-line p-4">
          <div className="inline-flex rounded-full bg-gradient-to-tr from-[#667eea] via-[#5B8DEF] to-[#f093fb] p-[2px]">
            <div className="rounded-full bg-surface p-0.5">
              <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }} />
            </div>
          </div>
        </div>
      </aside>

      {/* ── Right-hand column: top bar + page content ────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile / tablet top bar with hamburger (hidden at lg+) */}
        <MobileNav />

        {/* Scrollable page content — explicit bg so the main panel reads as
            a distinct surface (light: #F8F9FC, dark: #0F0F13) no matter what
            the child page renders (or doesn't render) for its background. */}
        <main className="flex-1 overflow-y-auto bg-[#F8F9FC] dark:bg-[#0F0F13]">
          {children}
        </main>
      </div>
    </div>
  )
}
