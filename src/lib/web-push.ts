// Kolasys AI — Web Push helper. Wraps the `web-push` Node module with
// lazy VAPID configuration so this file can be imported in the build's
// "collect page data" phase without env vars being present.

import webpush from 'web-push'

let _configured = false

function configure() {
  if (_configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:hi@kolasys.ai'
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  _configured = true
}

export type WebPushPayload = {
  title: string
  body: string
  /** Path on app.kolasys.ai to navigate to when the notification is clicked. */
  url?: string
  /** Optional notification icon override. */
  icon?: string
}

export type WebPushSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * Send a single push notification. Returns true on success, false on a
 * non-fatal error (e.g. expired subscription). Throws on configuration
 * errors so callers know to fix env.
 */
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: WebPushPayload,
): Promise<boolean> {
  configure()
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
    return true
  } catch (err) {
    // 404/410 = subscription was revoked by the browser. Caller should
    // delete it from the DB. We surface the status code so they can.
    const statusCode = (err as { statusCode?: number })?.statusCode
    console.error('[web-push] send failed:', { statusCode, err })
    return false
  }
}

/**
 * Send a push to *all* subscriptions belonging to a given OrgMember,
 * pruning any that the push service rejects with 404/410 (Gone).
 */
export async function sendWebPushToMember(
  orgMemberId: string,
  payload: WebPushPayload,
): Promise<{ sent: number; pruned: number }> {
  configure()
  const { db } = await import('@/lib/db')

  const subs = await db.webPushSubscription.findMany({
    where: { orgMemberId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })

  let sent = 0
  let pruned = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      )
      sent++
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await db.webPushSubscription
          .delete({ where: { id: s.id } })
          .catch(() => {/* race — fine */})
        pruned++
      } else {
        console.error('[web-push] send failed (kept):', { statusCode, err })
      }
    }
  }
  return { sent, pruned }
}

export const VAPID_PUBLIC_KEY = (): string => process.env.VAPID_PUBLIC_KEY ?? ''
