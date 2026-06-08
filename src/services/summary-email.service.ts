// Kolasys AI — Post-meeting summary email service
//
// Sends one summary email per recording (idempotency via Recording.summaryEmailSentAt).
// Respects both the org-level postMeetingEmail toggle and the per-user
// OrgMember.emailSummaryOnReady toggle.
//
// Graceful no-op when RESEND_API_KEY is absent — the key may not yet be
// deployed on Railway while the worker is already running.

import * as Sentry from '@sentry/nextjs'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { resend, FROM_EMAIL } from '@/lib/email'
import { buildSummaryEmailHtml } from './summary-email.template'

export async function sendSummaryEmail(recordingId: string): Promise<void> {
  // ── 0. Guard: key not yet on Railway ─────────────────────────────────────
  if (!process.env.RESEND_API_KEY) {
    console.log(`[summary-email] RESEND_API_KEY not set — skipping ${recordingId}`)
    return
  }

  // ── 1. Load recording (need summaryEmailSentAt for idempotency) ───────────
  const recording = await db.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, title: true, orgId: true, userId: true, summaryEmailSentAt: true },
  })
  if (!recording) {
    console.log(`[summary-email] Recording ${recordingId} not found — skipping`)
    return
  }

  // ── 2. Idempotency — JS null check (Neon DateTime comparison unreliable) ──
  if (recording.summaryEmailSentAt != null) {
    console.log(`[summary-email] Already sent at ${recording.summaryEmailSentAt.toISOString()} — skipping ${recordingId}`)
    return
  }

  // ── 3. Org-level toggle ───────────────────────────────────────────────────
  const org = await db.organization.findUnique({
    where: { id: recording.orgId },
    select: { postMeetingEmail: true },
  })
  if (org?.postMeetingEmail === false) {
    console.log(`[summary-email] org.postMeetingEmail=false — skipping ${recordingId}`)
    return
  }

  // ── 4. Per-user toggle ────────────────────────────────────────────────────
  const member = await db.orgMember.findFirst({
    where: { orgId: recording.orgId, userId: recording.userId },
    select: { emailSummaryOnReady: true },
  })
  if (member?.emailSummaryOnReady === false) {
    console.log(`[summary-email] member.emailSummaryOnReady=false — skipping ${recordingId}`)
    return
  }

  // ── 5. Resolve email via Clerk ────────────────────────────────────────────
  const client = await clerkClient()
  const clerkUser = await client.users.getUser(recording.userId)
  const toEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress
  if (!toEmail) {
    console.log(`[summary-email] No primary email for user ${recording.userId} — skipping ${recordingId}`)
    return
  }

  // ── 6. Fetch note content + transcript ────────────────────────────────────
  const note = await db.note.findFirst({
    where: { recordingId },
    select: {
      summary: true,
      sections: { orderBy: { order: 'asc' }, select: { title: true, content: true } },
      actionItems: { orderBy: { createdAt: 'asc' }, select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  const transcriptRow = await db.transcript.findFirst({
    where: { recordingId },
    select: { text: true },
  })

  // ── 7. Build HTML ─────────────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kolasys.ai'
  const html = buildSummaryEmailHtml({
    title: recording.title,
    recordingUrl: `${appUrl}/dashboard/recordings/${recordingId}`,
    noteSummary: note?.summary ?? null,
    sections: note?.sections ?? [],
    actionItems: note?.actionItems ?? [],
  })

  // ── 8. Build attachments (transcript.txt + summary.txt) ───────────────────
  const attachments: Array<{ filename: string; content: Buffer }> = []

  if (transcriptRow?.text) {
    attachments.push({
      filename: 'transcript.txt',
      content: Buffer.from(transcriptRow.text, 'utf-8'),
    })
  }

  const summaryTextParts: string[] = []
  if (note?.summary) summaryTextParts.push(note.summary)
  if (note?.sections.length) {
    summaryTextParts.push(
      note.sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n'),
    )
  }
  if (summaryTextParts.length) {
    attachments.push({
      filename: 'summary.txt',
      content: Buffer.from(summaryTextParts.join('\n\n'), 'utf-8'),
    })
  }

  // ── 9. Send ───────────────────────────────────────────────────────────────
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: `Meeting notes ready: ${recording.title}`,
    html,
    ...(attachments.length > 0 && { attachments }),
  })

  if (error) {
    throw new Error(`Resend API error: ${JSON.stringify(error)}`)
  }

  // ── 10. Stamp sent — findFirst + update (Neon HTTP, no updateMany) ────────
  const rec = await db.recording.findFirst({
    where: { id: recordingId },
    select: { id: true },
  })
  if (rec) {
    await db.recording.update({
      where: { id: rec.id },
      data: { summaryEmailSentAt: new Date() },
    })
  }

  console.log(`[summary-email] Sent to ${toEmail} for recording ${recordingId}`)
}
