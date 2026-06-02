// Kolasys AI — Dashboard layout
// Desktop (lg+): Fireflies-style CollapsibleSidebar on the left.
// Mobile:        MobileNav top bar + slide-out drawer.

import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { CreateOrganization } from '@clerk/nextjs'
import { MobileNav } from '@/components/mobile-nav'
import { CollapsibleSidebar } from '@/components/sidebar'
import { KolasysLogoMark } from '@/components/kolasys-logo'
import { TrialBanner } from '@/components/trial-banner'
import { WebPushRegistrar } from '@/components/web-push-registrar'
import { db } from '@/lib/db'

type TrialState =
  | { kind: 'expiring'; daysLeft: number; trialEndIso: string }
  | { kind: 'expired'; trialEndIso: string }
  | null

async function resolveTrialState(clerkOrgId: string): Promise<TrialState> {
  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { plan: true, trialEndsAt: true },
  })
  if (!org?.trialEndsAt) return null

  const ms = org.trialEndsAt.getTime() - Date.now()
  const trialEndIso = org.trialEndsAt.toISOString()
  const day = 24 * 60 * 60 * 1000

  // Yellow: trial active and ≤7 days remain.
  if (ms > 0 && ms <= 7 * day) {
    return {
      kind: 'expiring',
      daysLeft: Math.max(1, Math.ceil(ms / day)),
      trialEndIso,
    }
  }
  // Red: trial expired AND user is still on FREE (didn't upgrade).
  if (ms <= 0 && org.plan === 'FREE') {
    return { kind: 'expired', trialEndIso }
  }
  return null
}

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
            <KolasysLogoMark size={24} className="text-black dark:text-white" />
            <span className="logo-glow text-xl font-semibold tracking-tight text-primary">
              Kolasys <span style={{ color: '#CA2625' }}>AI</span>
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

  const trialState = await resolveTrialState(orgId)

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      {/* Desktop sidebar — Fireflies-style collapsible */}
      <CollapsibleSidebar />

      {/* Right-hand column: mobile top bar + scrollable content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="flex-1 overflow-y-auto bg-[#EEEAE3] dark:bg-[#0F0F13]">
          <TrialBanner state={trialState} />
          <WebPushRegistrar />
          {children}
        </main>
      </div>
    </div>
  )
}
