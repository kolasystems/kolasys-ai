// Kolasys AI — Meeting series auto-detection.
//
// Runs from the summarization worker after the AI title has been generated
// (step 8.4) — the topical AI title is a far stronger similarity signal
// than the default "Recording — Apr 29 10:39 AM" placeholder. Best matches
// (≥ 0.5 word overlap) either join an existing series or seed a new one
// from the two matched recordings.
//
// Prisma v7 caveat: no nested creates. We seed a new series with three
// sequential calls (create series → create membership A → create
// membership B) instead of one nested-create call.

import { db } from '@/lib/db'

// "May 18 — Rising Hope Board Reviews Financials" → "rising hope board"
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d+\s*[—-]\s*/i, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5)
    .join(' ')
}

// Word-overlap similarity in [0, 1]. Words ≤ 2 chars are dropped as noise.
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter((w) => w.length > 2))
  const wordsB = new Set(normalizeTitle(b).split(' ').filter((w) => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  return intersection / Math.max(wordsA.size, wordsB.size)
}

export async function detectAndAssignSeries(recordingId: string): Promise<void> {
  const recording = await db.recording.findUnique({
    where: { id: recordingId },
    include: {
      seriesMemberships: true,
    },
  })

  if (!recording || recording.seriesMemberships.length > 0) return
  if (!recording.title || recording.title.length < 5) return

  // Window: same org, ready recordings from the last 90 days.
  const recentRecordings = await db.recording.findMany({
    where: {
      orgId: recording.orgId,
      id: { not: recordingId },
      status: 'READY',
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    include: {
      seriesMemberships: { include: { series: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // First meaningful word of the new recording — used as a recurring-meeting
  // signal. Matching first words almost always indicate the same series
  // ("Standup — May 4" vs "Standup — May 11"), so we boost +0.2 when both
  // titles' leading meaningful words are identical.
  const firstA = normalizeTitle(recording.title)
    .split(' ')
    .find((w) => w.length > 2)

  let bestMatch: { recording: (typeof recentRecordings)[number]; score: number } | null = null
  for (const recent of recentRecordings) {
    const score = titleSimilarity(recording.title, recent.title)
    const firstB = normalizeTitle(recent.title)
      .split(' ')
      .find((w) => w.length > 2)
    const boostedScore =
      firstA && firstB && firstA === firstB ? score + 0.2 : score
    // Threshold lowered 0.5 → 0.3 (with boost) so recurring meetings that
    // share a first word but otherwise diverge ("Standup — sprint planning"
    // vs "Standup — retro") still group. We rank by boostedScore so a
    // first-word match can beat a slightly-higher raw similarity.
    if (boostedScore >= 0.3 && (!bestMatch || boostedScore > bestMatch.score)) {
      bestMatch = { recording: recent, score: boostedScore }
    }
  }

  if (!bestMatch) return

  const existingSeries = bestMatch.recording.seriesMemberships[0]?.series
  if (existingSeries) {
    await db.recordingSeriesMembership.create({
      data: { seriesId: existingSeries.id, recordingId },
    })
    await db.meetingSeries.update({
      where: { id: existingSeries.id },
      data: { updatedAt: new Date() },
    })
    console.log(
      `[series] assigned "${recording.title}" to series "${existingSeries.name}"`,
    )
    return
  }

  // Seed a fresh series from the two matched recordings. Prisma v7 has no
  // nested creates, so three sequential calls. Title-case the normalized
  // tokens for the human-readable name.
  const seriesName = normalizeTitle(recording.title)
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim()

  const series = await db.meetingSeries.create({
    data: {
      orgId: recording.orgId,
      name: seriesName || 'Untitled series',
      autoDetected: true,
    },
  })
  await db.recordingSeriesMembership.create({
    data: { seriesId: series.id, recordingId: bestMatch.recording.id },
  })
  await db.recordingSeriesMembership.create({
    data: { seriesId: series.id, recordingId },
  })
  console.log(`[series] created new series "${series.name}" with 2 recordings`)
}
