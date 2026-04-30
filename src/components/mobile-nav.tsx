'use client'

// Kolasys AI — Mobile / tablet navigation bar with hamburger + slide-out drawer
// Visible below lg (1024px). Hidden at lg+ via lg:hidden.

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
  Wand2,
  BarChart2,
  Users,
  Brain,
  CreditCard,
  Scissors,
} from 'lucide-react'
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs'
import { cn } from '@/lib/utils'
import { DarkModeToggle } from './dark-mode-toggle'
import { KolasysLogoMark } from './kolasys-logo'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/recordings', label: 'Recordings', icon: Mic2 },
  { href: '/dashboard/action-items', label: 'Action Items', icon: ListChecks },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/dashboard/contacts', label: 'Contacts', icon: Users },
  { href: '/dashboard/knowledge', label: 'Knowledge', icon: Brain },
  { href: '/dashboard/search', label: 'Ask AI', icon: Sparkles },
  { href: '/dashboard/soundbites', label: 'Soundbites', icon: Scissors },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, exact: true },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings/templates', label: 'Templates', icon: Wand2 },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? ''

  return (
    <>
      {/* Top bar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <KolasysLogoMark size={22} className="text-black dark:text-white" />
            <span className="text-sm font-semibold tracking-tight text-primary">
              Kolasys <span style={{ color: '#CA2625' }}>AI</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <DarkModeToggle compact />
          <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }} />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div className="relative flex w-72 max-w-[85vw] flex-col bg-sidebar-gradient shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <div className="flex items-center gap-2">
                <KolasysLogoMark size={22} className="text-black dark:text-white" />
                <span className="text-sm font-semibold tracking-tight text-primary">
                  Kolasys <span style={{ color: '#CA2625' }}>AI</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      active
                        ? 'glass-subtle text-primary'
                        : 'text-secondary hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)] hover:text-primary',
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent"
                        style={{ boxShadow: '0 0 12px var(--accent)' }}
                      />
                    )}
                    <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-accent' : 'text-muted')} />
                    {label}
                  </Link>
                )
              })}
            </nav>

            <div className="border-t border-line p-3">
              <DarkModeToggle />
            </div>

            <div className="border-t border-line p-4">
              <div className="inline-flex rounded-full p-[2px]" style={{ background: 'linear-gradient(135deg, #CA2625, #8B1A1A)' }}>
                <div className="rounded-full bg-surface p-0.5">
                  <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
