// Kolasys AI — Public REST API: confirm a desktop-app upload + enqueue
// transcription. Mirrors `recordings.confirmUpload` (tRPC) but authenticated
// via API key.
//
// POST /api/v1/recordings/{id}/confirm — auth: `Authorization: Bearer kol_…`

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { transcriptionQueue } from '@/lib/queues'
import { RecordingStatus } from '@/generated/prisma/client'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true, s3Key: true, orgId: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (!recording.s3Key) {
    return Response.json(
      { error: 'No S3 key on record. Did you call POST /api/v1/recordings first?' },
      { status: 400 },
    )
  }

  await db.recording.update({
    where: { id: recording.id },
    data: { status: RecordingStatus.PROCESSING },
  })

  // Resolve language: explicit input > org default > 'en'.
  const org = await db.organization.findFirst({
    where: { id: recording.orgId },
    select: { defaultTranscriptionLanguage: true },
  })
  const language = org?.defaultTranscriptionLanguage ?? 'en'

  await transcriptionQueue.add('transcribe', {
    recordingId: recording.id,
    orgId: recording.orgId,
    s3Key: recording.s3Key,
    language: language === 'auto' ? undefined : language,
  })

  return Response.json({ ok: true, recordingId: recording.id })
}
