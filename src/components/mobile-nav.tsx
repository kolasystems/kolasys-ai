'use client'

// Kolasys AI — Mobile navigation (hamburger + slide-out drawer)

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  X,
  Mic2,
  LayoutDashboard,
  ListChecks,
  Settings,
  Sparkles,
  Calendar,
} from 'lucide-react'
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/recordings', label: 'Recordings', icon: Mic2 },
  { href: '/dashboard/action-items', label: 'Action Items', icon: ListChecks },
  { href: '/dashboard/search', label: 'Ask AI', icon: Sparkles },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Mobile top bar — only visible on < md */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Mic2 className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-semibold tracking-tight">Kolasys AI</span>
          </div>
        </div>
        <UserButton
          appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }}
        />
      </div>

      {/* Drawer backdrop + panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          {/* Panel */}
          <div className="relative flex w-72 flex-col bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
              <div className="flex items-center gap-2">
                <Mic2 className="h-5 w-5 text-brand-600" />
                <span className="text-sm font-semibold tracking-tight">Kolasys AI</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 transition-colors"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Org switcher */}
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

            {/* Nav links */}
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                const active =
                  href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        active ? 'text-brand-600' : 'text-neutral-400',
                      )}
                    />
                    {label}
                  </Link>
                )
              })}
            </nav>

            {/* User */}
            <div className="border-t border-neutral-200 p-4">
              <UserButton
                appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
