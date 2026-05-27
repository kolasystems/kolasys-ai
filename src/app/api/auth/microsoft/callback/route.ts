// Kolasys AI — Microsoft Outlook Calendar OAuth2 — handle callback.
// Exchanges the auth code for an access + refresh token via msal-node,
// stores the refresh token on the OrgMember row.

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ConfidentialClientApplication } from '@azure/msal-node'
import { db } from '@/lib/db'

const SCOPES = ['Calendars.Read', 'offline_access', 'User.Read']

export async function GET(request: Request) {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId) redirect('/sign-in')

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    redirect('/dashboard/calendar?error=microsoft_auth_failed')
  }
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    redirect('/dashboard/calendar?error=not_configured')
  }
  if (!clerkOrgId) {
    redirect('/dashboard/calendar?error=no_org')
  }

  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
  })

  try {
    // msal-node manages an in-memory token cache; we have to pull the
    // refresh token out manually after exchange. `serialize()` returns the
    // full cache as JSON, which contains the RefreshToken record.
    await cca.acquireTokenByCode({
      code: code!,
      scopes: SCOPES,
      redirectUri,
    })

    const cacheJson = cca.getTokenCache().serialize()
    const refreshToken = extractRefreshToken(cacheJson)

    if (!refreshToken) {
      console.error('[microsoft/callback] No refresh token in cache')
      redirect('/dashboard/calendar?error=no_refresh_token')
    }

    const org = await db.organization.findFirst({
      where: { clerkOrgId: clerkOrgId! },
      select: { id: true },
    })
    if (!org) redirect('/dashboard/calendar?error=org_not_found')

    const member = await db.orgMember.findFirst({
      where: { orgId: org!.id, userId: userId! },
      select: { id: true },
    })
    if (!member) redirect('/dashboard/calendar?error=member_not_found')

    await db.orgMember.update({
      where: { id: member!.id },
      data: { microsoftRefreshToken: refreshToken },
    })
  } catch (err) {
    // redirect() throws a NEXT_REDIRECT control-flow error — let it propagate
    // instead of masking the inner guards (no_refresh_token / org_not_found /
    // member_not_found) as a generic token_exchange_failed.
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
    console.error('[microsoft/callback] error:', err)
    console.error('[microsoft/callback] Token exchange failed:', err)
    redirect('/dashboard/calendar?error=token_exchange_failed')
  }

  redirect('/dashboard/calendar?connected=microsoft')
}

/**
 * msal-node's token cache JSON has the shape:
 *   { RefreshToken: { "<key>": { secret: "...", ... } } }
 * We just grab the first secret since there's only one per session.
 */
function extractRefreshToken(cacheJson: string): string | null {
  try {
    const parsed = JSON.parse(cacheJson) as {
      RefreshToken?: Record<string, { secret?: string }>
    }
    const entries = Object.values(parsed.RefreshToken ?? {})
    const first = entries.find((e) => e.secret)
    return first?.secret ?? null
  } catch {
    return null
  }
}
