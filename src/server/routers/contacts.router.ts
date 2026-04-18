// Kolasys AI — Contacts aggregation tRPC router.
// Derives a per-speaker directory from SpeakerLabel + TranscriptSegment
// across every READY recording in the org.
import 'server-only'

import { router, orgProcedure } from '../trpc'

export type Contact = {
  name: string
  meetings: number
  totalTalkSeconds: number
  firstSeen: Date | null
  lastSeen: Date | null
}

// Safety cap — 10k segments across an org is several hours of meetings; plenty
// for a directory view without a pathological query on huge workspaces.
const SEGMENT_CAP = 10_000

export const contactsRouter = router({
  list: orgProcedure.query(async ({ ctx }): Promise<Contact[]> => {
    // 1. Labels — the source of display names. A speaker without a label is
    //    still tracked but shown under its raw id ("SPEAKER_0") so the user
    //    can see they exist and go rename them.
    const labels = await ctx.db.speakerLabel.findMany({
      where: { recording: { orgId: ctx.orgId } },
      select: { recordingId: true, speakerId: true, displayName: true },
    })

    const labelMap = new Map<string, string>()
    for (const l of labels) {
      labelMap.set(`${l.recordingId}:${l.speakerId}`, l.displayName)
    }

    // 2. Segments — join up to the recording for orgId scope + createdAt, and
    //    only for READY recordings so in-flight transcriptions don't skew the
    //    "first/last seen" dates.
    const segments = await ctx.db.transcriptSegment.findMany({
      where: {
        speaker: { not: null },
        transcript: {
          recording: { orgId: ctx.orgId, status: 'READY' },
        },
      },
      select: {
        speaker: true,
        startTime: true,
        endTime: true,
        transcript: {
          select: {
            recordingId: true,
            recording: { select: { createdAt: true } },
          },
        },
      },
      take: SEGMENT_CAP,
      orderBy: { createdAt: 'desc' },
    })

    // 3. Aggregate by display name (falling back to raw speaker id).
    type Agg = {
      name: string
      totalTalkSeconds: number
      meetings: Set<string>
      firstSeen: Date | null
      lastSeen: Date | null
    }
    const aggMap = new Map<string, Agg>()

    for (const seg of segments) {
      if (!seg.speaker) continue
      const key =
        labelMap.get(`${seg.transcript.recordingId}:${seg.speaker}`) ??
        seg.speaker

      let agg = aggMap.get(key)
      if (!agg) {
        agg = {
          name: key,
          totalTalkSeconds: 0,
          meetings: new Set<string>(),
          firstSeen: null,
          lastSeen: null,
        }
        aggMap.set(key, agg)
      }

      agg.totalTalkSeconds += Math.max(0, seg.endTime - seg.startTime)
      agg.meetings.add(seg.transcript.recordingId)

      const createdAt = seg.transcript.recording?.createdAt ?? null
      if (createdAt) {
        if (!agg.firstSeen || createdAt < agg.firstSeen) agg.firstSeen = createdAt
        if (!agg.lastSeen || createdAt > agg.lastSeen) agg.lastSeen = createdAt
      }
    }

    const contacts: Contact[] = [...aggMap.values()]
      .map((a) => ({
        name: a.name,
        meetings: a.meetings.size,
        totalTalkSeconds: Math.round(a.totalTalkSeconds),
        firstSeen: a.firstSeen,
        lastSeen: a.lastSeen,
      }))
      .sort((a, b) => {
        if (b.meetings !== a.meetings) return b.meetings - a.meetings
        return b.totalTalkSeconds - a.totalTalkSeconds
      })

    return contacts
  }),
})
