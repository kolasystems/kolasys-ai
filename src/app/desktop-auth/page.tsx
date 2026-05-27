// Kolasys AI — Desktop sign-in handoff.
//
// Clerk-protected (NOT in the public route matcher): the user must already be
// signed in to the web app. On load we mint an org-scoped API key for them and
// bounce the browser to `kolasys://auth?token=…`, which the desktop app's
// custom URL-scheme handler catches and stores.
//
// The key is created via the same tRPC procedure the dashboard uses, so org
// resolution, self-healing membership, and the suspension gate all apply.

import Link from 'next/link'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { appRouter } from '@/server/root'
import { createTRPCContext, createCallerFactory } from '@/server/trpc'
import { KolasysLogoMark } from '@/components/kolasys-logo'
import { DesktopAuthRedirect } from './redirect-client'

export const dynamic = 'force-dynamic'

// Only ever hand control to our own custom scheme — never an arbitrary
// redirect target supplied via the query string.
function sanitizeRedirect(raw?: string): string {
  if (raw && /^kolasys:\/\//i.test(raw)) return raw
  return 'kolasys://auth'
}

export default async function DesktopAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in?redirect_url=/desktop-auth')

  const sp = await searchParams
  const redirectBase = sanitizeRedirect(sp.redirect)

  // Resolve the signing user's primary email — baked into the key name so the
  // desktop app's /api/v1/me lookup can surface it in the Account panel.
  let email: string | null = null
  try {
    const client = await clerkClient()
    const u = await client.users.getUser(userId)
    email = u.primaryEmailAddressId
      ? u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? null
      : u.emailAddresses[0]?.emailAddress ?? null
  } catch {
    // Non-fatal — proceed without an email label.
  }

  // Mint the token via the tRPC caller (reuses orgProcedure: org resolution,
  // membership self-heal, suspension gate).
  let token: string | null = null
  let error: string | null = null
  try {
    const ctx = await createTRPCContext({ headers: await headers() })
    const createCaller = createCallerFactory(appRouter)
    const caller = createCaller(ctx)

    // Revoke prior desktop keys for this org so each sign-in invalidates the
    // previous token — older installs get a 401 on their next API call and
    // fall back to the sign-in screen. Covers both the `Desktop · <email>`
    // name and the no-email `Kolasys Desktop` fallback.
    const existingKeys = await caller.apiKeys.list()
    for (const key of existingKeys) {
      if (key.name.startsWith('Desktop ·') || key.name === 'Kolasys Desktop') {
        await caller.apiKeys.revoke({ id: key.id })
      }
    }

    const created = await caller.apiKeys.create({
      name: email ? `Desktop · ${email}` : 'Kolasys Desktop',
    })
    token = created.key
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not generate a desktop token.'
  }

  if (!token) {
    return (
      <div style={wrap}>
        <KolasysLogoMark size={48} className="text-white" />
        <h1 style={heading}>Couldn’t connect the desktop app</h1>
        <p style={sub}>{error}</p>
        <Link href="/dashboard" style={btn}>
          Go to dashboard
        </Link>
      </div>
    )
  }

  const url = `${redirectBase}?token=${encodeURIComponent(token)}`
  return <DesktopAuthRedirect url={url} email={email} />
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0f0f0f',
  color: '#fff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  textAlign: 'center',
  padding: 24,
  gap: 12,
}
const heading: React.CSSProperties = { fontSize: 20, fontWeight: 600, margin: '8px 0 0' }
const sub: React.CSSProperties = { fontSize: 14, color: '#8e8e93', margin: 0, maxWidth: 380, lineHeight: 1.5 }
const btn: React.CSSProperties = {
  marginTop: 12,
  background: '#CA2625',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  padding: '10px 20px',
  borderRadius: 10,
  textDecoration: 'none',
}
