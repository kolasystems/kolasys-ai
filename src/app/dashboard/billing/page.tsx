// Kolasys AI — In-app billing page. Shows current plan, trial status, and
// usage. Subscription mutations route through server actions that call
// the same Stripe helpers as /api/stripe/checkout and /api/stripe/portal.

import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { db } from '@/lib/db'
import {
  PRICES,
  createOrgCheckoutSession,
  createOrgPortalSession,
} from '@/lib/stripe'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Billing — Kolasys AI' }

// ── Server actions ────────────────────────────────────────────────────────
async function startCheckoutAction(formData: FormData) {
  'use server'
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) redirect('/sign-in')

  const priceId = String(formData.get('priceId') ?? '')
  const seatsRaw = Number(formData.get('seats') ?? 0)
  const seats = Number.isFinite(seatsRaw) && seatsRaw > 0 ? seatsRaw : undefined

  const org = await resolveOrgIdFromClerk(clerkOrgId)
  const { url } = await createOrgCheckoutSession({ orgId: org.id, priceId, seats })
  redirect(url)
}

async function openPortalAction() {
  'use server'
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) redirect('/sign-in')

  const org = await resolveOrgIdFromClerk(clerkOrgId)
  try {
    const { url } = await createOrgPortalSession(org.id)
    redirect(url)
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_CUSTOMER') {
      redirect('/dashboard/billing?portalErr=nocustomer')
    }
    throw err
  }
}

async function resolveOrgIdFromClerk(clerkOrgId: string) {
  let org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true },
  })
  if (org) return org

  const client = await clerkClient()
  const clerkOrg = await client.organizations.getOrganization({
    organizationId: clerkOrgId,
  })
  const baseSlug = clerkOrg.slug ?? clerkOrgId
  const slugTaken = await db.organization.findFirst({
    where: { slug: baseSlug },
    select: { id: true },
  })
  const slug = slugTaken ? clerkOrgId : baseSlug
  try {
    org = await db.organization.create({
      data: { name: clerkOrg.name, slug, clerkOrgId },
      select: { id: true },
    })
  } catch {
    org = await db.organization.findFirst({
      where: { clerkOrgId },
      select: { id: true },
    })
  }
  if (!org) throw new Error('Failed to resolve organization')
  return org
}

// ── Page ───────────────────────────────────────────────────────────────────
type Props = {
  searchParams: Promise<{ upgraded?: string; portalErr?: string }>
}

export default async function BillingPage({ searchParams }: Props) {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId) redirect('/sign-in')
  if (!clerkOrgId) redirect('/dashboard')

  const sp = await searchParams

  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: {
      id: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      trialStartedAt: true,
      trialEndsAt: true,
      maxRecordingsPerMonth: true,
    },
  })
  if (!org) redirect('/dashboard')

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  )
  const recordingsThisMonth = await db.recording.count({
    where: { orgId: org.id, createdAt: { gte: monthStart } },
  })

  const isPaid = org.plan === 'PRO' || org.plan === 'ENTERPRISE'
  const trialActive =
    org.trialEndsAt !== null && org.trialEndsAt.getTime() > Date.now()
  const trialDaysLeft = trialActive
    ? Math.max(
        1,
        Math.ceil(
          (org.trialEndsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : 0

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Billing
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Manage your plan, payment method, and usage.
        </p>
      </header>

      {sp.upgraded === 'true' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          Subscription activated — welcome aboard.
        </div>
      )}
      {sp.portalErr === 'nocustomer' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Open the Manage Subscription link only after starting a subscription.
        </div>
      )}

      {/* Current plan */}
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-gray-400">
              Current plan
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: '#CA2625' }}
              >
                {org.plan}
              </span>
              {trialActive && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  Trial
                </span>
              )}
            </div>
          </div>

          {isPaid && org.stripeCustomerId && (
            <form action={openPortalAction}>
              <button
                type="submit"
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                Manage subscription
              </button>
            </form>
          )}
        </div>

        {trialActive && org.trialEndsAt && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <strong>Trial ends {org.trialEndsAt.toLocaleDateString()}</strong>{' '}
            — {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left.
          </div>
        )}

        {/* Usage meter */}
        <div className="mt-5">
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-medium text-neutral-500 dark:text-gray-400">
              Recordings this month
            </p>
            <p className="text-xs tabular-nums text-neutral-700 dark:text-gray-200">
              {recordingsThisMonth}
              {org.maxRecordingsPerMonth > 0 && ` / ${org.maxRecordingsPerMonth}`}
              {org.maxRecordingsPerMonth === 0 && ' / Unlimited'}
            </p>
          </div>
          {org.maxRecordingsPerMonth > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
              <div
                className={
                  recordingsThisMonth >= org.maxRecordingsPerMonth
                    ? 'h-full bg-red-500'
                    : recordingsThisMonth / org.maxRecordingsPerMonth >= 0.8
                      ? 'h-full bg-amber-500'
                      : 'h-full bg-green-500'
                }
                style={{
                  width: `${Math.min(100, Math.round((recordingsThisMonth / org.maxRecordingsPerMonth) * 100))}%`,
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Upgrade CTA — only shown on FREE */}
      {!isPaid && (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#CA2625]" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Start your 14-day free trial
            </h2>
          </div>
          <p className="mb-5 text-sm text-neutral-500 dark:text-gray-400">
            No credit card charged for 14 days. Cancel anytime from the billing portal.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Pro */}
            <div className="rounded-lg border-2 border-[#CA2625] bg-white p-5 dark:bg-[#1A1A24]">
              <p className="text-sm font-semibold text-neutral-500 dark:text-gray-400">
                Pro
              </p>
              <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                $9.99 <span className="text-sm font-medium text-neutral-500">/month</span>
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
                or $99/year (save 17%)
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-neutral-700 dark:text-gray-200">
                <li>· Unlimited transcription</li>
                <li>· Unlimited AI summaries</li>
                <li>· Semantic search + Analytics</li>
                <li>· 1 workspace</li>
              </ul>
              <form action={startCheckoutAction} className="mt-4 space-y-2">
                <input type="hidden" name="priceId" value={PRICES.pro_monthly} />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#CA2625] py-2 text-sm font-semibold text-white hover:bg-[#b21f1f]"
                >
                  Start Pro monthly
                </button>
              </form>
              <form action={startCheckoutAction} className="mt-2">
                <input type="hidden" name="priceId" value={PRICES.pro_yearly} />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-[#CA2625]/40 bg-white py-2 text-sm font-semibold text-[#CA2625] hover:bg-[#CA2625]/5 dark:bg-transparent"
                >
                  Pro yearly · $99
                </button>
              </form>
            </div>

            {/* Team */}
            <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-[#1A1A24]">
              <p className="text-sm font-semibold text-neutral-500 dark:text-gray-400">
                Team
              </p>
              <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">
                $8.99{' '}
                <span className="text-sm font-medium text-neutral-500">
                  /seat / month
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
                Min 3 seats. Shared workspace + admin controls.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-neutral-700 dark:text-gray-200">
                <li>· Everything in Pro</li>
                <li>· Shared workspace</li>
                <li>· Custom bot name</li>
                <li>· Priority support</li>
              </ul>
              <form action={startCheckoutAction} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="priceId" value={PRICES.team_monthly} />
                <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-gray-400">
                  Seats
                  <input
                    type="number"
                    name="seats"
                    min={3}
                    defaultValue={3}
                    className="w-16 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs tabular-nums focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
                >
                  Start Team trial
                </button>
              </form>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
