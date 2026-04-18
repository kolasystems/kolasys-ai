// Kolasys AI — Daily digest cron endpoint
// Called every day at 8 AM UTC by Vercel Cron (see vercel.json).
// Manual invocation: curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/daily-digest
//
// Auth: validates Authorization: Bearer {CRON_SECRET} header.
// Per-org opt-out via Organization.dailyDigest (default true).

import { NextRequest } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { resend, FROM_EMAIL } from '@/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 300

// HTML-safe escape for user-provided strings interpolated into the email body.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kolasys.ai'
  const now = new Date()
  const yesterdayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  let totalSent = 0
  let totalErrors = 0

  try {
    // ── Find orgs with activity in the last 24h (READY only) ─────────────
    const activeOrgs = await db.recording.findMany({
      where: { createdAt: { gte: yesterdayStart }, status: 'READY' },
      select: { orgId: true },
      distinct: ['orgId'],
    })

    if (activeOrgs.length === 0) {
      return Response.json({ success: true, sent: 0, message: 'No active orgs' })
    }

    const client = await clerkClient()

    for (const { orgId } of activeOrgs) {
      try {
        // ── Skip orgs that opted out ──────────────────────────────────────
        const org = await db.organization.findUnique({
          where: { id: orgId },
          select: { name: true, dailyDigest: true },
        })
        if (!org || org.dailyDigest === false) {
          console.log(`[daily-digest] SKIP ${orgId} — dailyDigest disabled`)
          continue
        }

        const [recordings, members] = await Promise.all([
          db.recording.findMany({
            where: {
              orgId,
              createdAt: { gte: yesterdayStart },
              status: 'READY',
            },
            include: {
              notes: {
                include: {
                  actionItems: {
                    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
                  },
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
            orderBy: { createdAt: 'desc' },
          }),
          db.orgMember.findMany({
            where: { orgId },
            select: { userId: true },
            // "Owner" = first user to join the org. OrgMember.createdAt is set
            // at row creation so oldest first yields the founder.
            orderBy: { createdAt: 'asc' },
            take: 1,
          }),
        ])

        if (recordings.length === 0 || members.length === 0) continue

        // ── Gather action items across yesterday's meetings ───────────────
        const actionItems = recordings.flatMap((r) =>
          r.notes.flatMap((n) =>
            n.actionItems
              .filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS')
              .map((a) => ({ title: a.title, recordingTitle: r.title }))
          )
        )

        // ── Resolve owner email ───────────────────────────────────────────
        const ownerId = members[0].userId
        const clerkUser = await client.users.getUser(ownerId)
        const email = clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress
        if (!email) continue

        // ── Build HTML ────────────────────────────────────────────────────
        const meetingsHtml = recordings
          .map((r) => {
            const summary = r.notes[0]?.summary?.slice(0, 220) ?? ''
            const truncated = (r.notes[0]?.summary?.length ?? 0) > 220
            return `
  <div style="border-bottom: 1px solid #e2e8f0; padding: 12px 0;">
    <a href="${appUrl}/dashboard/recordings/${r.id}" style="color: #1e293b; text-decoration: none; font-weight: 600; font-size: 14px;">
      ${esc(r.title)}
    </a>
    ${summary ? `<p style="color: #475569; margin: 6px 0 0; font-size: 13px; line-height: 1.5;">${esc(summary)}${truncated ? '…' : ''}</p>` : ''}
  </div>
            `
          })
          .join('')

        const actionItemsHtml =
          actionItems.length > 0
            ? `
  <h2 style="color: #1e293b; font-size: 16px; margin: 24px 0 12px;">
    Open Action Items (${actionItems.length})
  </h2>
  <div style="background: #f8fafc; border-radius: 8px; padding: 16px;">
    ${actionItems
      .slice(0, 8)
      .map(
        (a) =>
          `<p style="margin: 4px 0; color: #475569; font-size: 13px;">• ${esc(a.title)} <span style="color: #94a3b8;">— ${esc(a.recordingTitle)}</span></p>`
      )
      .join('')}
    ${actionItems.length > 8
      ? `<p style="color: #94a3b8; margin: 8px 0 0; font-size: 13px;">+ ${actionItems.length - 8} more</p>`
      : ''}
  </div>
            `
            : ''

        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px; margin-bottom: 24px;">
    <h1 style="color: white; margin: 0; font-size: 20px;">☕ Your Kolasys AI Daily Digest</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${esc(dateLabel)}</p>
  </div>

  <h2 style="color: #1e293b; font-size: 16px; margin-bottom: 12px;">
    Yesterday's Meetings (${recordings.length})
  </h2>
  ${meetingsHtml}

  ${actionItemsHtml}

  <a href="${appUrl}/dashboard"
     style="display: inline-block; margin-top: 24px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
    Open Dashboard →
  </a>

  <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
    Kolasys AI · ${esc(org.name ?? 'Your workspace')} · <a href="${appUrl}/dashboard/settings" style="color: #667eea;">Manage email preferences</a>
  </p>
</div>
        `.trim()

        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: `Your Kolasys AI Daily Digest — ${dateLabel}`,
          html,
        })

        totalSent += 1
        console.log(`[daily-digest] Sent to ${email} for org ${orgId}`)
      } catch (orgErr) {
        console.error(`[daily-digest] Failed org ${orgId}:`, orgErr)
        totalErrors += 1
      }
    }
  } catch (err) {
    console.error('[daily-digest] Fatal error:', err)
    return Response.json(
      { success: false, sent: totalSent, errors: totalErrors },
      { status: 500 }
    )
  }

  console.log(`[daily-digest] Done. Sent: ${totalSent}, Errors: ${totalErrors}`)
  return Response.json({ success: true, sent: totalSent, errors: totalErrors })
}
