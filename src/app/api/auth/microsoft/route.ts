// Kolasys AI — Microsoft Outlook Calendar OAuth2 — initiate authorization.
// Uses msal-node's ConfidentialClientApplication to mint the authorize URL.

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ConfidentialClientApplication } from '@azure/msal-node'

const SCOPES = ['Calendars.Read', 'offline_access', 'User.Read']

function redirectUri(): string {
  return (
    process.env.MICROSOFT_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`
  )
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return new Response('Microsoft Calendar is not configured on this server.', {
      status: 501,
    })
  }

  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
  })

  // `prompt: 'consent'` so we reliably receive a refresh token even if the
  // user has previously consented at the tenant level.
  const url = await cca.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: redirectUri(),
    prompt: 'consent',
  })

  redirect(url)
}
