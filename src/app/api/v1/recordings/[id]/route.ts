// Kolasys AI — Public REST API: fetch / delete a single recording.
// Auth: `Authorization: Bearer kol_…`
//
// GET    /api/v1/recordings/{id} — full untruncated payload (list endpoint
//        trims summary to 280 chars; this is the detail-page source).
// DELETE /api/v1/recordings/{id} — drop the row. Postgres cascades every
//        Recording child (Note → ActionItem/NoteSection, Transcript,
//        Soundbite, SpeakerLabel, SharedInvite, ProcessingJob,
//        KnowledgeEntityRecording, RecordingSeriesMembership) via
//        onDelete: Cascade. S3 object is intentionally NOT removed —
//        deferred to a future async cleanup pass.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      source: true,
      duration: true,
      personalNotes: true,
      createdAt: true,
      startedAt: true,
      endedAt: true,
      // Speaker labels for this recording — { speakerId, displayName } per
      // labeled speaker, sorted by speakerId so SPEAKER_0..N render in order.
      speakerLabels: {
        select: { speakerId: true, displayName: true },
        orderBy: { speakerId: 'asc' },
      },
      // AI note — full untruncated payload. Mirrors the shape the web detail
      // page renders (src/app/dashboard/recordings/[id]/page.tsx → noteProp):
      // Note-level { id, summary, templateId }, sections[] with order so the
      // desktop can sort independently, and action items with status/priority/
      // dueDate. Sorted server-side: sections by order asc, action items by
      // priority asc — same as the dashboard query.
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          summary: true,
          templateId: true,
          sections: {
            orderBy: { order: 'asc' },
            select: { id: true, title: true, content: true, order: true },
          },
          actionItems: {
            orderBy: { priority: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              dueDate: true,
            },
          },
        },
      },
    },
  })

  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Top knowledge entities mentioned in this recording — separate query
  // because Recording → Note (for notes) and Recording → KnowledgeEntity
  // (via KnowledgeEntityRecording) are independent edges. Capped at 20 to
  // bound payload size on busy recordings.
  const entityLinks = await db.knowledgeEntityRecording.findMany({
    where: { recordingId: id },
    include: { entity: { select: { id: true, type: true, name: true } } },
    orderBy: { mentions: 'desc' },
    take: 20,
  })
  const entities = entityLinks.map((e) => ({
    id: e.entity.id,
    type: e.entity.type,
    name: e.entity.name,
    mentions: e.mentions,
  }))

  return Response.json({ ...recording, entities })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  // Org-scope the lookup so a bearer key can only delete its own org's rows.
  // findFirst + select: { id } — no need to pull s3Key since the spec
  // explicitly defers S3 cleanup to a later async pass.
  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Single cascade-aware delete — Postgres drops every dependent row via the
  // onDelete: Cascade declarations on the FKs (verified on Transcript,
  // Soundbite, SpeakerLabel, SharedInvite, ProcessingJob,
  // KnowledgeEntityRecording, RecordingSeriesMembership, Note; Note then
  // cascades to NoteSection + ActionItem). Mirrors recordings.delete (tRPC)
  // minus the S3 deletion.
  await db.recording.delete({ where: { id: recording.id } })

  return Response.json({ success: true })
}
