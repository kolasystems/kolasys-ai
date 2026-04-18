// Kolasys AI — Conversation intelligence analytics tRPC router.
// Aggregates recording-level stats, weekly meeting frequency, and speaker
// talk-time across all READY recordings in the current org.
import 'server-only'

import { router, orgProcedure } from '../trpc'

export type WeeklyBucket = { label: string; count: number }
export type SpeakerTalkTime = { name: string; seconds: number }
export type RecentRecording = {
  id: string
  title: string
  createdAt: Date
  duration: number | null
  noteCount: number
  actionItemCount: number
}

export type AnalyticsStats = {
  totalMeetings: number
  totalDuration: number
  avgDuration: number
  totalActionItems: number
  weeklyData: WeeklyBucket[]
  speakerTalkTime: SpeakerTalkTime[]
  recentRecordings: RecentRecording[]
}

// Cap the number of segments we fetch for cross-recording speaker aggregation.
// 5k segments is ~1-2h of transcripts; plenty for a dashboard preview and
// keeps the query bounded for large orgs.
const SPEAKER_SEGMENT_LIMIT = 5_000

export const analyticsRouter = router({
  getStats: orgProcedure.query(async ({ ctx }): Promise<AnalyticsStats> => {
    // ── 1. Recordings + note counts + action-item counts in one pass ─────
    const recordings = await ctx.db.recording.findMany({
      where: { orgId: ctx.orgId, status: 'READY' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        duration: true,
        notes: {
          select: {
            id: true,
            _count: { select: { actionItems: true } },
          },
        },
      },
    })

    const totalActionItems = recordings.reduce(
      (sum, r) => sum + r.notes.reduce((s, n) => s + n._count.actionItems, 0),
      0,
    )

    const totalDuration = recordings.reduce(
      (sum, r) => sum + (r.duration ?? 0),
      0,
    )
    const avgDuration =
      recordings.length > 0 ? totalDuration / recordings.length : 0

    // ── 2. Weekly meeting frequency over the last 12 weeks ───────────────
    const now = new Date()
    const weeklyData: WeeklyBucket[] = Array.from({ length: 12 }, (_, i) => {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (11 - i) * 7)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)

      return {
        label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: recordings.filter(
          (r) => r.createdAt >= weekStart && r.createdAt < weekEnd,
        ).length,
      }
    })

    // ── 3. Speaker talk time across all org transcripts ──────────────────
    // Speakers are labelled per-recording as "SPEAKER_0", "SPEAKER_1" etc.,
    // so we join SpeakerLabel where available and aggregate by displayName.
    // Two people named "SPEAKER_0" in different recordings will collapse into
    // a single bucket — that's the documented trade-off until per-person
    // identity is tracked across meetings.
    const [segments, labels] = await Promise.all([
      ctx.db.transcriptSegment.findMany({
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
          transcript: { select: { recordingId: true } },
        },
        take: SPEAKER_SEGMENT_LIMIT,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.db.speakerLabel.findMany({
        where: { recording: { orgId: ctx.orgId } },
        select: { recordingId: true, speakerId: true, displayName: true },
      }),
    ])

    const labelMap = new Map<string, string>()
    for (const l of labels) {
      labelMap.set(`${l.recordingId}:${l.speakerId}`, l.displayName)
    }

    const talkSeconds = new Map<string, number>()
    for (const seg of segments) {
      if (!seg.speaker) continue
      const key =
        labelMap.get(`${seg.transcript.recordingId}:${seg.speaker}`) ??
        seg.speaker
      const durationSec = Math.max(0, seg.endTime - seg.startTime)
      talkSeconds.set(key, (talkSeconds.get(key) ?? 0) + durationSec)
    }

    const speakerTalkTime: SpeakerTalkTime[] = [...talkSeconds.entries()]
      .map(([name, seconds]) => ({ name, seconds: Math.round(seconds) }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 8)

    // ── 4. Recent recordings table ───────────────────────────────────────
    const recentRecordings: RecentRecording[] = recordings.slice(0, 10).map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      duration: r.duration,
      noteCount: r.notes.length,
      actionItemCount: r.notes.reduce((s, n) => s + n._count.actionItems, 0),
    }))

    return {
      totalMeetings: recordings.length,
      totalDuration,
      avgDuration,
      totalActionItems,
      weeklyData,
      speakerTalkTime,
      recentRecordings,
    }
  }),
})
