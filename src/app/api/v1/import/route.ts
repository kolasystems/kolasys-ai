export const runtime = 'nodejs'

// Kolasys AI — Meeting import API.
//
// POST /api/v1/import   multipart/form-data: { platform, file }
//
// Routes to a platform-specific parser, then persists each meeting as a
// Recording + Note + ActionItems. All writes are sequential (Prisma v7
// HTTP mode — no transactions). Returns import statistics.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { RecordingSource, RecordingStatus } from '@/generated/prisma/client'
import {
  parseFirefliesExport,
  parseOtterExport,
  parseFathomExport,
  parseReadAIExport,
  type ImportedMeeting,
} from '@/services/import-parsers'

const SUPPORTED_PLATFORMS = ['fireflies', 'otter', 'fathom', 'readai'] as const
type Platform = (typeof SUPPORTED_PLATFORMS)[number]

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const platform = formData.get('platform') as string | null
  const file = formData.get('file') as File | null

  if (!platform || !SUPPORTED_PLATFORMS.includes(platform as Platform)) {
    return Response.json(
      { error: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}` },
      { status: 400 },
    )
  }
  if (!file) {
    return Response.json({ error: 'file is required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let meetings: ImportedMeeting[]
  try {
    meetings = await parsePlatform(platform as Platform, buffer)
  } catch (err) {
    console.error('[import] parse failed:', err)
    return Response.json({ error: 'Failed to parse file' }, { status: 422 })
  }

  if (meetings.length === 0) {
    return Response.json({ imported: 0, skipped: 0, meetings: [] })
  }

  const userId = auth.userId ?? `apikey:${auth.keyId}`
  const now = new Date()
  let imported = 0
  let skipped = 0
  const imported_meetings: Array<{ id: string; title: string }> = []

  for (const meeting of meetings) {
    try {
      const recording = await db.recording.create({
        data: {
          orgId: auth.orgId,
          userId,
          title: meeting.title,
          source: RecordingSource.IMPORT,
          status: RecordingStatus.READY,
          duration: meeting.duration ?? null,
          importPlatform: platform,
          importedAt: now,
          createdAt: meeting.date,
        },
      })

      // Note — summary only; no sections for imports (no AI involved)
      const note = await db.note.create({
        data: {
          recordingId: recording.id,
          orgId: auth.orgId,
          userId,
          title: meeting.title,
          summary: meeting.summary ?? null,
        },
      })

      // Transcript stored as a single segment if present
      if (meeting.transcript) {
        const transcript = await db.transcript.create({
          data: {
            recordingId: recording.id,
            text: meeting.transcript,
            language: 'en',
          },
        })
        await db.transcriptSegment.create({
          data: {
            transcriptId: transcript.id,
            text: meeting.transcript,
            startTime: 0,
            endTime: meeting.duration ?? 0,
          },
        })
      }

      // ActionItems linked to the note
      for (const item of meeting.actionItems) {
        if (!item.trim()) continue
        await db.actionItem.create({
          data: {
            noteId: note.id,
            orgId: auth.orgId,
            title: item.slice(0, 255),
          },
        })
      }

      imported++
      imported_meetings.push({ id: recording.id, title: recording.title })
    } catch (err) {
      console.error('[import] failed to persist meeting:', meeting.title, err)
      skipped++
    }
  }

  return Response.json({ imported, skipped, meetings: imported_meetings })
}

async function parsePlatform(platform: Platform, buffer: Buffer): Promise<ImportedMeeting[]> {
  switch (platform) {
    case 'fireflies': return parseFirefliesExport(buffer)
    case 'otter':     return parseOtterExport(buffer)
    case 'fathom':    return parseFathomExport(buffer)
    case 'readai':    return parseReadAIExport(buffer)
  }
}
