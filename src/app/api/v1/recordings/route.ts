// Kolasys AI — Public REST API: list / create recordings.
// Auth: `Authorization: Bearer kol_…`
//
// GET  /api/v1/recordings           — list recordings for the authenticated org
// POST /api/v1/recordings           — create a recording + return a pre-signed
//                                     S3 upload URL. Used by the Mac desktop
//                                     app to stream local audio captures.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { generateRecordingKey, getSignedUploadUrl } from '@/lib/storage'
import { RecordingSource, RecordingStatus } from '@/generated/prisma/client'

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)

  const recordings = await db.recording.findMany({
    where: { orgId: auth.orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
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
    },
  })

  return Response.json({ recordings })
}

type CreateBody = {
  title?: string
  durationSeconds?: number
  language?: string
  source?: string
  mimeType?: string
}

// Map of accepted upload MIME types to their S3-key extensions. The signed
// PUT URL must commit to a single content-type up front (AWS rejects PUTs
// whose Content-Type header doesn't match the signature), so the client
// declares its format here at create time.
const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/m4a': 'm4a',
  'audio/mp4': 'mp4',
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  let body: CreateBody = {}
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = (body.title ?? '').trim()
  if (!title) {
    return Response.json({ error: '`title` is required' }, { status: 400 })
  }

  // Source: caller may override (e.g. UPLOAD via a custom integration), but
  // the default for this endpoint is DESKTOP because the Mac app is the
  // primary consumer. Anything not in the enum falls back to DESKTOP.
  const requested = (body.source ?? '').toUpperCase()
  const source: RecordingSource =
    requested in RecordingSource
      ? (requested as RecordingSource)
      : RecordingSource.DESKTOP

  // ── Plan + usage cap enforcement ────────────────────────────────────────
  // Mirrors the check in `recordings.create` (tRPC). FREE without an active
  // trial is capped at 3 recordings/month; any admin-set
  // maxRecordingsPerMonth on the org is enforced regardless of plan.
  const planCheck = await db.organization.findFirst({
    where: { id: auth.orgId },
    select: { plan: true, trialEndsAt: true, maxRecordingsPerMonth: true },
  })
  if (planCheck) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const trialActive =
      planCheck.trialEndsAt !== null &&
      planCheck.trialEndsAt.getTime() > now.getTime()

    const FREE_MONTHLY_LIMIT = 3
    const isFreeNoTrial = planCheck.plan === 'FREE' && !trialActive
    const adminCap = planCheck.maxRecordingsPerMonth

    if (isFreeNoTrial || adminCap > 0) {
      const used = await db.recording.count({
        where: { orgId: auth.orgId, createdAt: { gte: monthStart } },
      })
      if (isFreeNoTrial && used >= FREE_MONTHLY_LIMIT) {
        return Response.json(
          {
            error: 'Free plan limit reached',
            message:
              'Free plan limit reached. Upgrade to Pro for unlimited recordings.',
          },
          { status: 403 },
        )
      }
      if (adminCap > 0 && used >= adminCap) {
        return Response.json(
          {
            error: 'Monthly recording cap reached',
            message: `Monthly recording limit (${adminCap}) reached for this organization.`,
          },
          { status: 403 },
        )
      }
    }
  }

  // RecordingStatus has no UPLOADING value — existing upload paths use
  // PENDING during the create-then-PUT window. Worker only acts on the
  // recording once /confirm flips it to PROCESSING.
  const recording = await db.recording.create({
    data: {
      orgId: auth.orgId,
      // No Clerk user on a bearer-authed call; attribute to the API key id
      // so the audit trail still points back at "who/what" created it.
      userId: `apikey:${auth.keyId}`,
      title,
      source,
      status: RecordingStatus.PENDING,
      duration: body.durationSeconds,
    },
    select: { id: true },
  })

  // Default to m4a (the Mac app's native AVAudioRecorder format). The
  // Electron desktop client uses MediaRecorder which produces audio/webm,
  // so it passes mimeType explicitly. Unknown types fall back to m4a so
  // older clients keep working.
  const requestedMime = (body.mimeType ?? '').toLowerCase()
  const mimeType = requestedMime in MIME_TO_EXT ? requestedMime : 'audio/m4a'
  const ext = MIME_TO_EXT[mimeType]

  const s3Key = generateRecordingKey(auth.orgId, recording.id, ext)
  const uploadUrl = await getSignedUploadUrl(s3Key, mimeType)

  await db.recording.update({
    where: { id: recording.id },
    data: { s3Key, s3Bucket: process.env.S3_BUCKET_NAME },
  })

  return Response.json({
    recordingId: recording.id,
    uploadUrl,
    s3Key,
  })
}
