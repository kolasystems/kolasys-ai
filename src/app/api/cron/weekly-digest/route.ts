// Kolasys AI — Weekly digest cron endpoint
// Called every Monday at 9 AM UTC by Vercel Cron (see vercel.json).
// Also callable manually with: curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/weekly-digest
//
// Auth: validates Authorization: Bearer {CRON_SECRET} header.
// Set CRON_SECRET as a Vercel env var and in your local .env.

import { NextRequest } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { WeeklyDigestEmail } from '@/emails/weekly-digest'
import React from 'react'

export const runtime = 'nodejs'
// Vercel Cron functions have a max duration of 60s on Hobby, 300s on Pro
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kolasys.ai'
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  let totalSent = 0
  let totalErrors = 0

  try {
    // ── Find orgs with activity this week ─────────────────────────────────
    const activeOrgRecordings = await db.recording.findMany({
      where: { createdAt: { gte: oneWeekAgo }, status: 'READY' },
      select: { orgId: true },
      distinct: ['orgId'],
    })

    // Also include orgs with open action items (even with no new recordings)
    const orgsWithActionItems = await db.actionItem.findMany({
      where: { status: 'OPEN' },
      select: { orgId: true },
      distinct: ['orgId'],
    })

    const uniqueOrgIds = [
      ...new Set([
        ...activeOrgRecordings.map((r) => r.orgId),
        ...orgsWithActionItems.map((a) => a.orgId),
      ]),
    ]

    if (uniqueOrgIds.length === 0) {
      return Response.json({ sent: 0, message: 'No active orgs this week' })
    }

    const client = await clerkClient()

    // ── Process each org ──────────────────────────────────────────────────
    for (const orgId of uniqueOrgIds) {
      try {
        const [org, recordings, actionItems, members] = await Promise.all([
          db.organization.findUnique({
            where: { id: orgId },
            select: { name: true },
          }),
          db.recording.findMany({
            where: { orgId, createdAt: { gte: oneWeekAgo }, status: 'READY' },
            select: { id: true, title: true, duration: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          }),
          db.actionItem.findMany({
            where: { orgId, status: 'OPEN' },
            select: { id: true, title: true, priority: true, dueDate: true },
            orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
            take: 20,
          }),
          db.orgMember.findMany({
            where: { orgId },
            select: { userId: true },
          }),
        ])

        // No recordings and no action items — skip this org
        if (recordings.length === 0 && actionItems.length === 0) continue

        const orgName = org?.name ?? 'Your workspace'

        // ── Send to each member ─────────────────────────────────────────
        for (const { userId } of members) {
          try {
            const clerkUser = await client.users.getUser(userId)
            const email = clerkUser.emailAddresses.find(
              (e) => e.id === clerkUser.primaryEmailAddressId
            )?.emailAddress

            if (!email) continue

            const firstName = clerkUser.firstName ?? 'there'

            await sendEmail({
              to: email,
              subject: `Your week in review — ${recordings.length} meeting${recordings.length !== 1 ? 's' : ''}, ${actionItems.length} open action item${actionItems.length !== 1 ? 's' : ''}`,
              react: React.createElement(WeeklyDigestEmail, {
                recipientName: firstName,
                orgName,
                recordings,
                actionItems,
                weekStart: oneWeekAgo,
                appUrl,
              }),
            })

            totalSent++
          } catch (memberErr) {
            console.error(`[weekly-digest] Failed for user ${userId} in org ${orgId}:`, memberErr)
            totalErrors++
          }
        }
      } catch (orgErr) {
        console.error(`[weekly-digest] Failed to process org ${orgId}:`, orgErr)
        totalErrors++
      }
    }
  } catch (err) {
    console.error('[weekly-digest] Fatal error:', err)
    return Response.json(
      { error: 'Internal server error', sent: totalSent, errors: totalErrors },
      { status: 500 }
    )
  }

  console.log(`[weekly-digest] Done. Sent: ${totalSent}, Errors: ${totalErrors}`)
  return Response.json({ sent: totalSent, errors: totalErrors })
}
