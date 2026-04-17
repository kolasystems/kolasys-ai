// Kolasys AI — Calendar sync page (server component + client sub-components)

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { CalendarMeetingsList } from '@/components/calendar-meetings-list'
import { Calendar, ExternalLink } from 'lucide-react'

export const metadata = { title: 'Calendar — Kolasys AI' }

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) redirect('/dashboard')

  const { connected, error } = await searchParams

  // Resolve DB membership to check Google token
  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true },
  })

  const member = org
    ? await db.orgMember.findFirst({
        where: { orgId: org.id, userId },
        select: { googleRefreshToken: true },
      })
    : null

  const isConnected = !!member?.googleRefreshToken
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  return (
    <div className="p-4 dark:bg-[#0F0F13] sm:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Calendar</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            Upcoming meetings — deploy a recording bot in one click.
          </p>
        </div>
        {isConnected && (
          <form action="/api/auth/google" method="GET">
            <button
              type="submit"
              className="text-xs text-neutral-500 underline hover:text-neutral-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Reconnect Google
            </button>
          </form>
        )}
      </div>

      {/* Feedback banners */}
      {connected === '1' && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">
          Google Calendar connected successfully.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {errorMessage(error)}
        </div>
      )}

      {/* Not configured */}
      {!googleConfigured && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 text-center dark:border-white/10">
          <Calendar className="mb-3 h-10 w-10 text-neutral-300 dark:text-gray-500" />
          <p className="text-sm font-medium text-neutral-700 dark:text-white">Google Calendar not configured</p>
          <p className="mt-1 max-w-xs text-xs text-neutral-500 dark:text-gray-400">
            Set <code className="rounded bg-neutral-100 px-1 dark:bg-white/10 dark:text-gray-300">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="rounded bg-neutral-100 px-1 dark:bg-white/10 dark:text-gray-300">GOOGLE_CLIENT_SECRET</code> in your
            environment to enable Calendar sync.
          </p>
        </div>
      )}

      {/* Not connected */}
      {googleConfigured && !isConnected && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 text-center dark:border-white/10">
          <Calendar className="mb-3 h-10 w-10 text-neutral-300 dark:text-gray-500" />
          <p className="text-sm font-medium text-neutral-900 dark:text-white">Connect Google Calendar</p>
          <p className="mt-1 max-w-xs text-xs text-neutral-500 dark:text-gray-400">
            Grant read-only access to your calendar. Kolasys AI will never modify your events.
          </p>
          <a
            href="/api/auth/google"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <ExternalLink className="h-4 w-4" />
            Connect Google Calendar
          </a>
          <p className="mt-3 text-xs text-neutral-400 dark:text-gray-500">
            Read-only access · Calendar events only · Disconnect any time
          </p>
        </div>
      )}

      {/* Connected — show meetings via client component (needs tRPC) */}
      {googleConfigured && isConnected && <CalendarMeetingsList />}

      {/* Microsoft Outlook (coming soon) */}
      <section className="mt-8 rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-white/10 dark:text-gray-300"
              aria-hidden
            >
              MS
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">Microsoft Outlook Calendar</p>
              <p className="text-xs text-neutral-500 dark:text-gray-400">
                Sync Teams and Outlook meetings. Deploy bots from your work calendar.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled
            aria-disabled
            className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400"
          >
            Connect Microsoft
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-white/10 dark:text-gray-300">
              Coming soon
            </span>
          </button>
        </div>
      </section>
    </div>
  )
}

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    google_auth_failed: 'Google authorization was declined or failed. Please try again.',
    no_refresh_token: 'Google did not return a refresh token. Please try disconnecting and reconnecting.',
    no_org: 'No active workspace selected. Please switch to a workspace first.',
    org_not_found: 'Workspace not found. Please try again.',
    member_not_found: 'Your membership could not be verified. Please try again.',
    token_exchange_failed: 'Failed to exchange the authorization code. Please try again.',
    not_configured: 'Google Calendar is not configured on this server.',
  }
  return map[code] ?? `An error occurred (${code}). Please try again.`
}
