// Kolasys AI — Outbound webhook payload signing.
//
// Scheme mirrors Stripe's inbound verification (stripe.webhooks.constructEvent):
//   signed_payload = "${timestampSec}.${rawBody}"
//   hmac           = HMAC-SHA256(key=secret, data=signed_payload) → hex
//   header value   = "t=${timestampSec},v1=${hmac}"
//
// Customers verify by reading t= and v1= from the X-Kolasys-Signature header,
// reconstructing the signed_payload string, and comparing their own HMAC digest
// against v1 with a constant-time comparison.

import { createHmac } from 'node:crypto'

/**
 * Signs a webhook payload.
 *
 * @param rawBody     - The exact JSON string that will be sent as the POST body.
 * @param secret      - The endpoint's signing secret (whsec_… prefix, stored plaintext).
 * @param timestampSec - Unix timestamp in seconds (Math.floor(Date.now() / 1000)).
 * @returns           Header value: "t=<timestampSec>,v1=<HMAC-SHA256-hex>"
 */
export function signWebhookPayload(
  rawBody: string,
  secret: string,
  timestampSec: number,
): string {
  const signedPayload = `${timestampSec}.${rawBody}`
  const hmac = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return `t=${timestampSec},v1=${hmac}`
}
