// Kolasys AI — Google Calendar OAuth2 — initiate authorization

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { google } from 'googleapis'

export async function GET() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return new Response('Google Calendar is not configured on this server.', { status: 501 })
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    prompt: 'consent',
  })

  redirect(url)
}
