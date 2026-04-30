// Kolasys AI — Returns the VAPID public key the browser uses to subscribe
// to push notifications. Public key is safe to expose.

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) {
    return Response.json(
      { error: 'VAPID_PUBLIC_KEY not configured' },
      { status: 500 },
    )
  }
  return Response.json({ publicKey: key })
}
