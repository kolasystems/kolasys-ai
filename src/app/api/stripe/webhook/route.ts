// Kolasys AI — Stripe webhook handler.
//
// POST /api/stripe/webhook — public (called by Stripe). Verified via the
// `stripe-signature` header against STRIPE_WEBHOOK_SECRET. Handlers are
// idempotent: re-running the same event is safe.
//
// Note on Next.js 16 App Router: the legacy `export const config = { api:
// { bodyParser: false } }` from the Pages Router does nothing here.
// Reading the raw body via `await request.text()` is sufficient — the
// router doesn't pre-parse it.

import type Stripe from 'stripe'
import { stripe, planForPriceId } from '@/lib/stripe'
import { db } from '@/lib/db'
import { Plan } from '@/generated/prisma/client'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) {
    return new Response('Missing signature or webhook secret', { status: 400 })
  }

  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed:', err)
    return new Response('Bad signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId =
          (session.metadata?.orgId as string | undefined) ??
          (typeof session.subscription === 'object' && session.subscription
            ? (session.subscription as Stripe.Subscription).metadata?.orgId
            : undefined)

        if (!orgId) {
          console.error('[stripe/webhook] checkout.session.completed missing orgId metadata')
          break
        }

        // Resolve the subscription to find the active price → our Plan.
        let priceId: string | null = null
        let stripeSubscriptionId: string | null = null
        let trialEnd: Date | null = null
        if (session.subscription) {
          const sub =
            typeof session.subscription === 'string'
              ? await stripe.subscriptions.retrieve(session.subscription)
              : (session.subscription as Stripe.Subscription)
          stripeSubscriptionId = sub.id
          priceId = sub.items.data[0]?.price.id ?? null
          if (sub.trial_end) trialEnd = new Date(sub.trial_end * 1000)
        }

        const stripeCustomerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null

        const plan = planForPriceId(priceId)
        await db.organization.update({
          where: { id: orgId },
          data: {
            plan: plan as Plan,
            stripeCustomerId: stripeCustomerId ?? undefined,
            stripeSubscriptionId,
            trialStartedAt: trialEnd ? new Date() : undefined,
            trialEndsAt: trialEnd ?? undefined,
          },
        })
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id

        const org = await db.organization.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        })
        if (!org) {
          console.error(`[stripe/webhook] no org for customer ${customerId}`)
          break
        }

        const priceId = sub.items.data[0]?.price.id ?? null
        // If the sub is no longer active (canceled, past_due, etc.), drop
        // them back to FREE rather than honouring the last-known price.
        const isActive = sub.status === 'active' || sub.status === 'trialing'
        const plan = isActive ? planForPriceId(priceId) : 'FREE'

        await db.organization.update({
          where: { id: org.id },
          data: {
            plan: plan as Plan,
            stripeSubscriptionId: sub.id,
            trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          },
        })
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id

        const org = await db.organization.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        })
        if (!org) break

        await db.organization.update({
          where: { id: org.id },
          data: {
            plan: Plan.FREE,
            stripeSubscriptionId: null,
            trialEndsAt: null,
          },
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id ?? null
        const org = customerId
          ? await db.organization.findFirst({
              where: { stripeCustomerId: customerId },
              select: { id: true, name: true },
            })
          : null
        console.error(
          '[stripe/webhook] invoice.payment_failed',
          { orgId: org?.id, orgName: org?.name, customerId, amount: invoice.amount_due },
        )
        // TODO: send dunning email via Resend.
        break
      }

      default:
        // Unhandled event type — ignore but acknowledge with 200 so Stripe
        // doesn't retry forever.
        break
    }
  } catch (err) {
    console.error(`[stripe/webhook] handler error for ${event.type}:`, err)
    return new Response('Internal error', { status: 500 })
  }

  return Response.json({ received: true })
}
