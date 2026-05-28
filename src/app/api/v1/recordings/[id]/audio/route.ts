// Kolasys AI — Public REST API: presigned audio URL for a recording.
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/recordings/{id}/audio — returns a short-lived presigned S3 URL
// the desktop player can stream from. Mirrors the tRPC `recordings.getAudioUrl`
// query in src/server/routers/recordings.router.ts: 404 when the recording row
// doesn't exist; `{ audioUrl: null }` when the row exists but the audio is
// gone (no s3Key yet, or already deleted by the deleteAudioAfterTranscription
// org setting).

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { getSignedDownloadUrl, objectExists } from '@/lib/storage'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  // Org-scope the lookup so a key can only sign URLs for its own org's audio.
  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true, s3Key: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (!recording.s3Key) {
    return Response.json({ audioUrl: null })
  }

  // The audio may have been pruned (deleteAudioAfterTranscription) even though
  // the row still has an s3Key. Confirm the object is actually there before
  // handing the desktop a URL that would 404 mid-stream.
  const exists = await objectExists(recording.s3Key)
  if (!exists) {
    return Response.json({ audioUrl: null })
  }

  const audioUrl = await getSignedDownloadUrl(recording.s3Key, 3600)
  return Response.json({ audioUrl })
}
