// Kolasys AI — Dashboard layout with sidebar

import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import {
  UserButton,
  OrganizationSwitcher,
  CreateOrganization,
} from '@clerk/nextjs'
import { Mic2, LayoutDashboard, ListChecks, Settings, Sparkles, Calendar } from 'lucide-react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')

  // New users have no org yet. Show the Clerk CreateOrganization flow before
  // letting them into the app — every data mutation requires an active org.
  if (!orgId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Mic2 className="h-6 w-6 text-brand-600" />
            <span className="text-xl font-semibold tracking-tight">Kolasys AI</span>
          </div>
          <p className="text-sm text-neutral-600">
            Create a workspace to get started. All recordings and notes are
            organised under a workspace.
          </p>
        </div>
        <CreateOrganization
          afterCreateOrganizationUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: 'shadow-lg rounded-2xl overflow-hidden',
            },
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b border-neutral-200 px-5">
          <Mic2 className="h-5 w-5 text-brand-600" />
          <span className="text-sm font-semibold tracking-tight">Kolasys AI</span>
        </div>

        {/* Org switcher — hidePersonal forces org context; allow creating new orgs */}
        <div className="border-b border-neutral-200 px-4 py-3">
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: 'w-full',
                organizationSwitcherTrigger:
                  'w-full rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-100 justify-start',
              },
            }}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 p-3">
          <NavLink href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
            Overview
          </NavLink>
          <NavLink href="/dashboard/recordings" icon={<Mic2 className="h-4 w-4" />}>
            Recordings
          </NavLink>
          <NavLink href="/dashboard/action-items" icon={<ListChecks className="h-4 w-4" />}>
            Action Items
          </NavLink>
          <NavLink href="/dashboard/search" icon={<Sparkles className="h-4 w-4" />}>
            Ask AI
          </NavLink>
          <NavLink href="/dashboard/calendar" icon={<Calendar className="h-4 w-4" />}>
            Calendar
          </NavLink>
          <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>
            Settings
          </NavLink>
          <NavLink href="/dashboard/settings/integrations" icon={<Settings className="h-4 w-4" />}>
            Integrations
          </NavLink>
        </nav>

        {/* User */}
        <div className="border-t border-neutral-200 p-4">
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: 'h-8 w-8',
              },
            }}
          />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
    >
      <span className="text-neutral-500">{icon}</span>
      {children}
    </Link>
  )
}
