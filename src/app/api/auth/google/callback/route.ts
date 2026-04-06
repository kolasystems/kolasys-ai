// Kolasys AI — Google Calendar OAuth2 — handle callback, store refresh token

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { google } from 'googleapis'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId) redirect('/sign-in')

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    redirect('/dashboard/calendar?error=google_auth_failed')
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    redirect('/dashboard/calendar?error=not_configured')
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  )

  try {
    const { tokens } = await oauth2Client.getToken(code!)
    const refreshToken = tokens.refresh_token

    if (!refreshToken) {
      redirect('/dashboard/calendar?error=no_refresh_token')
    }

    // Resolve DB org so we can find the OrgMember row
    if (!clerkOrgId) {
      redirect('/dashboard/calendar?error=no_org')
    }

    const org = await db.organization.findFirst({
      where: { clerkOrgId: clerkOrgId! },
      select: { id: true },
    })

    if (!org) {
      redirect('/dashboard/calendar?error=org_not_found')
    }

    const member = await db.orgMember.findFirst({
      where: { orgId: org!.id, userId: userId! },
      select: { id: true },
    })

    if (!member) {
      redirect('/dashboard/calendar?error=member_not_found')
    }

    await db.orgMember.update({
      where: { id: member!.id },
      data: { googleRefreshToken: refreshToken },
    })
  } catch (err) {
    console.error('[google/callback] Token exchange failed:', err)
    redirect('/dashboard/calendar?error=token_exchange_failed')
  }

  redirect('/dashboard/calendar?connected=1')
}
