// Kolasys AI — Meeting import parsers.
//
// Each parser accepts a raw Buffer and returns a normalised array of
// ImportedMeeting objects ready to be persisted by the import API route.
// Parsers are intentionally lenient — real-world exports vary; we extract
// what we can and skip fields we can't find rather than throwing.

import JSZip from 'jszip'

export type ImportedMeeting = {
  title: string
  date: Date
  duration?: number // seconds
  transcript?: string
  summary?: string
  actionItems: string[]
}

// ── Fireflies.ai ──────────────────────────────────────────────────────────
// Export: Settings → Export → Download ZIP
// ZIP contains one JSON file per meeting.

type FirefliesJson = {
  title?: string
  date?: string
  duration?: number
  summary?: string
  transcript?: Array<{ speaker?: string; text?: string; time?: number }>
  action_items?: string[]
}

export async function parseFirefliesExport(buffer: Buffer): Promise<ImportedMeeting[]> {
  const zip = await JSZip.loadAsync(buffer)
  const meetings: ImportedMeeting[] = []

  for (const [filename, file] of Object.entries(zip.files)) {
    if (!filename.endsWith('.json') || file.dir) continue
    try {
      const raw = await file.async('string')
      const data = JSON.parse(raw) as FirefliesJson

      const transcript = (data.transcript ?? [])
        .map((seg) => `${seg.speaker ?? 'Speaker'}: ${seg.text ?? ''}`)
        .join('\n')

      meetings.push({
        title: data.title ?? filename.replace('.json', ''),
        date: data.date ? new Date(data.date) : new Date(),
        duration: data.duration ?? undefined,
        summary: data.summary ?? undefined,
        transcript: transcript || undefined,
        actionItems: data.action_items ?? [],
      })
    } catch {
      // Skip malformed JSON files
    }
  }

  return meetings
}

// ── Otter.ai ──────────────────────────────────────────────────────────────
// Export: workspace.otter.ai → Conversations → Export (TXT or SRT)
// TXT format: speaker lines followed by transcript text, blank-line separated.
// SRT format: numbered blocks with timestamps.

export function parseOtterExport(buffer: Buffer): ImportedMeeting[] {
  const text = buffer.toString('utf-8')
  const lines = text.split('\n')

  // Detect SRT (numbered blocks with --> timestamps)
  if (lines.some((l) => /^\d+$/.test(l.trim()) && l.trim().length < 6)) {
    return parseOtterSrt(text)
  }

  // TXT format
  const titleMatch = text.match(/^(.+?)(?:\n|$)/)
  const title = titleMatch?.[1]?.trim() ?? 'Otter Import'

  // Extract date from metadata line like "January 15, 2024" or ISO
  const dateMatch = text.match(/(\w+ \d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2})/)
  const date = dateMatch ? new Date(dateMatch[1]) : new Date()

  // Speaker segments: "Name  HH:MM" followed by text until next segment
  const segments: string[] = []
  const speakerPattern = /^(.+?)\s{2,}(\d+:\d{2}(?::\d{2})?)\s*$/
  let current = ''
  for (const line of lines) {
    if (speakerPattern.test(line)) {
      if (current.trim()) segments.push(current.trim())
      current = line + '\n'
    } else {
      current += line + '\n'
    }
  }
  if (current.trim()) segments.push(current.trim())

  const transcript = segments.slice(1).join('\n\n') || text

  return [{ title, date, transcript, actionItems: [] }]
}

function parseOtterSrt(text: string): ImportedMeeting[] {
  // SRT blocks: index \n timestamp \n text \n blank
  const blocks = text.split(/\n\n+/).filter(Boolean)
  const lines: string[] = []
  for (const block of blocks) {
    const blockLines = block.split('\n').filter((l) => !/^\d+$/.test(l.trim()) && !l.includes('-->'))
    if (blockLines.length) lines.push(blockLines.join(' '))
  }
  return [{
    title: 'Otter Import',
    date: new Date(),
    transcript: lines.join('\n'),
    actionItems: [],
  }]
}

// ── Fathom ────────────────────────────────────────────────────────────────
// Export: fathom.video → Past calls → Export CSV
// Columns: Title, Date, Duration, Summary, Action Items

export function parseFathomExport(buffer: Buffer): ImportedMeeting[] {
  const text = buffer.toString('utf-8')
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const header = rows[0].map((h) => h.toLowerCase().trim())
  const col = (name: string) => header.findIndex((h) => h.includes(name))

  const titleCol = col('title')
  const dateCol = col('date')
  const durationCol = col('duration')
  const summaryCol = col('summary')
  const actionsCol = col('action')

  const meetings: ImportedMeeting[] = []
  for (const row of rows.slice(1)) {
    if (!row.length || !row[0]?.trim()) continue
    try {
      const title = titleCol >= 0 ? row[titleCol] ?? 'Fathom Import' : 'Fathom Import'
      const rawDate = dateCol >= 0 ? row[dateCol] ?? '' : ''
      const date = rawDate ? new Date(rawDate) : new Date()
      const durationStr = durationCol >= 0 ? row[durationCol] ?? '' : ''
      const duration = parseDurationToSeconds(durationStr)
      const summary = summaryCol >= 0 ? row[summaryCol] ?? undefined : undefined
      const actionsRaw = actionsCol >= 0 ? row[actionsCol] ?? '' : ''
      const actionItems = actionsRaw
        ? actionsRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
        : []

      meetings.push({ title, date, duration, summary, actionItems })
    } catch {
      // Skip unparseable rows
    }
  }
  return meetings
}

// Minimal CSV parser — handles quoted fields with embedded commas/newlines.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++
        row.push(field); field = ''
        rows.push(row); row = []
      } else { field += ch }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function parseDurationToSeconds(s: string): number | undefined {
  // "45:00" → 2700, "1:30:00" → 5400, "45 min" → 2700
  const colonMatch = s.match(/(\d+):(\d{2})(?::(\d{2}))?/)
  if (colonMatch) {
    const [, a, b, c] = colonMatch
    return c
      ? parseInt(a) * 3600 + parseInt(b) * 60 + parseInt(c)
      : parseInt(a) * 60 + parseInt(b)
  }
  const minMatch = s.match(/(\d+)\s*min/)
  if (minMatch) return parseInt(minMatch[1]) * 60
  return undefined
}

// ── Read AI ───────────────────────────────────────────────────────────────
// Export: app.read.ai → Reports → Export PDF
// Sections: Meeting Summary, Key Topics, Action Items, Transcript

export async function parseReadAIExport(buffer: Buffer): Promise<ImportedMeeting[]> {
  // Avoid Next.js webpack bundling the pdf-parse index which loads test files.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
    buf: Buffer,
    opts?: object,
  ) => Promise<{ text: string }>

  let fullText: string
  try {
    const result = await pdfParse(buffer)
    fullText = result.text
  } catch {
    return []
  }

  const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean)

  // First non-empty line is usually the meeting title
  const title = lines[0] ?? 'Read AI Import'

  // Date: look for ISO or written date near the top
  const dateMatch = fullText.match(/(\w+ \d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2})/)
  const date = dateMatch ? new Date(dateMatch[1]) : new Date()

  // Extract named section: returns text between this heading and the next
  const extractSection = (heading: RegExp): string => {
    const idx = lines.findIndex((l) => heading.test(l))
    if (idx < 0) return ''
    const nextHeading = /^(Meeting Summary|Key Topics|Action Items|Transcript|Attendees)/i
    const end = lines.findIndex((l, i) => i > idx && nextHeading.test(l))
    return lines.slice(idx + 1, end < 0 ? undefined : end).join(' ')
  }

  const summary = extractSection(/meeting summary/i) || extractSection(/summary/i) || undefined
  const actionsText = extractSection(/action items/i)
  const actionItems = actionsText
    ? actionsText.split(/[•\-\n]/).map((s) => s.trim()).filter((s) => s.length > 4)
    : []

  const transcriptText = extractSection(/transcript/i) || undefined

  return [{ title, date, summary, transcript: transcriptText, actionItems }]
}
