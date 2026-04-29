// Kolasys AI — Stripe SDK + helpers shared by the API routes and the
// billing tRPC router.

import Stripe from 'stripe'
import { db } from '@/lib/db'

// Lazy singleton — the Stripe SDK throws at construction time if the API
// key is missing, and Next.js evaluates this module during the build's
// "collect page data" phase before runtime env vars are guaranteed to be
// loaded. Defer instantiation until the first real call.
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  _stripe = new Stripe(key, {
    // Pinned to the version we built against. Stripe preserves API contracts
    // at this version even when newer ones ship. The Stripe SDK's TS types
    // only describe the *latest* API version; their docs recommend
    // suppressing the literal-narrowing error when pinning:
    // https://stripe.com/docs/api/versioning
    // @ts-expect-error — using account-pinned version, not the SDK's latest.
    apiVersion: '2025-01-27.acacia',
  })
  return _stripe
}

/**
 * Re-exported for backwards compatibility with the spec that asked for
 * `import { stripe } from '@/lib/stripe'`. Behaves like a normal Stripe
 * instance through the lazy proxy.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_t, prop, recv) {
    return Reflect.get(getStripe(), prop, recv)
  },
})

export const PRICES = {
  pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
  pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID!,
  team_monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!,
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kolasys.ai'

/**
 * Look up (or create) the Stripe Customer record for an org and return its
 * id. Persists `stripeCustomerId` on the Organization row the first time.
 */
export async function ensureStripeCustomer(orgId: string): Promise<string> {
  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: { id: true, name: true, stripeCustomerId: true },
  })
  if (!org) throw new Error(`Organization ${orgId} not found`)
  if (org.stripeCustomerId) return org.stripeCustomerId

  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { orgId: org.id },
  })
  await db.organization.update({
    where: { id: org.id },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

/**
 * Create a Stripe Checkout Session for the given org + price. For seat-based
 * plans (`team_monthly`) pass `seats`; ignored for the per-customer prices.
 */
export async function createOrgCheckoutSession({
  orgId,
  priceId,
  seats,
}: {
  orgId: string
  priceId: string
  seats?: number
}): Promise<{ url: string }> {
  if (!priceId) throw new Error('priceId is required')

  const customerId = await ensureStripeCustomer(orgId)
  const isTeam = priceId === PRICES.team_monthly
  const quantity = isTeam ? Math.max(3, Math.floor(seats ?? 3)) : 1

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { orgId },
    },
    success_url: `${APP_URL}/dashboard?upgraded=true`,
    cancel_url: `${APP_URL}/pricing`,
    metadata: { orgId },
    allow_promotion_codes: true,
  })

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout URL')
  }
  return { url: session.url }
}

/**
 * Create a Stripe Billing Portal session so an org can manage its sub.
 * Throws if the org has no Stripe customer yet — the API route translates
 * that into a 400 for the caller.
 */
export async function createOrgPortalSession(
  orgId: string,
): Promise<{ url: string }> {
  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: { stripeCustomerId: true },
  })
  if (!org) throw new Error(`Organization ${orgId} not found`)
  if (!org.stripeCustomerId) {
    throw new Error('NO_CUSTOMER')
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${APP_URL}/dashboard/billing`,
  })
  return { url: session.url }
}

/**
 * Map a Stripe price id to our internal Plan enum. Used by the webhook
 * when a subscription is created or updated. Anything we don't recognise
 * falls back to FREE so an unmapped price can't silently grant access.
 */
export function planForPriceId(
  priceId: string | null | undefined,
): 'FREE' | 'PRO' | 'ENTERPRISE' {
  if (!priceId) return 'FREE'
  if (priceId === PRICES.pro_monthly || priceId === PRICES.pro_yearly) return 'PRO'
  // Team price maps to ENTERPRISE per the current schema (no TEAM enum value).
  if (priceId === PRICES.team_monthly) return 'ENTERPRISE'
  return 'FREE'
}
