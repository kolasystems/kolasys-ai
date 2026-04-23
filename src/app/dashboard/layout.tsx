// Kolasys AI — Dashboard layout
// Desktop (lg+): Fireflies-style CollapsibleSidebar on the left.
// Mobile:        MobileNav top bar + slide-out drawer.

import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { CreateOrganization } from '@clerk/nextjs'
import { MobileNav } from '@/components/mobile-nav'
import { CollapsibleSidebar } from '@/components/sidebar'
import { KolasysLogoMark } from '@/components/kolasys-logo'

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

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      {/* Desktop sidebar — Fireflies-style collapsible */}
      <CollapsibleSidebar />

      {/* Right-hand column: mobile top bar + scrollable content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="flex-1 overflow-y-auto bg-[#F8F9FC] dark:bg-[#0F0F13]">
          {children}
        </main>
      </div>
    </div>
  )
}
