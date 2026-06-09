// Kolasys AI — Summarization service (Anthropic Claude)

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type ExtractedActionItem = {
  title: string
  description?: string
  assignee?: string          // Name from transcript — not a Clerk ID
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate?: string           // ISO 8601 (YYYY-MM-DD) if mentioned, otherwise omitted
}

export type SectionDefinition = {
  title: string
  prompt: string
}

export type GeneratedSection = {
  title: string
  content: string
  order: number
}

export type SummarizationResult = {
  summary: string
  sections: GeneratedSection[]
}

const DEFAULT_SECTIONS: SectionDefinition[] = [
  {
    title: 'Meeting Overview',
    prompt:
      'Write a 2-3 sentence summary of what this meeting was about and who attended.',
  },
  {
    title: 'Key Discussion Points',
    prompt:
      'List the main topics discussed as bullet points. Be concise.',
  },
  {
    title: 'Decisions Made',
    prompt:
      'List any decisions that were made during the meeting. If none, write "No decisions recorded."',
  },
  {
    title: 'Action Items',
    prompt:
      'List action items as bullet points in the format: "- [Owner] Task description". If no clear owner, use "TBD".',
  },
  {
    title: 'Open Items & Unresolved Questions',
    prompt:
      'List any decisions that were discussed but not concluded, items raised without a clear owner or resolution, and explicit follow-ups that still need further discussion. Use bullet points. If there are none, omit this section from the JSON output entirely — do not include an empty heading.',
  },
  {
    title: 'Next Steps',
    prompt:
      'Briefly describe agreed next steps or follow-up meetings.',
  },
]

/**
 * Generate structured meeting notes from a transcript using Claude.
 */
export async function summarizeTranscript(
  transcript: string,
  sections: SectionDefinition[] = DEFAULT_SECTIONS,
  meetingTitle?: string
): Promise<SummarizationResult> {
  const sectionInstructions = sections
    .map((s, i) => `${i + 1}. **${s.title}**: ${s.prompt}`)
    .join('\n')

  const systemPrompt = `You are an expert meeting notes assistant for Kolasys AI.
Your job is to analyze meeting transcripts and produce clear, structured notes.
Always be concise, factual, and capture the most important information.
Return your response as a JSON object with the shape:
{
  "summary": "<one paragraph executive summary>",
  "sections": [
    { "title": "<section title>", "content": "<markdown content>" }
  ]
}`

  const userPrompt = `Meeting title: ${meetingTitle ?? 'Untitled Meeting'}

Transcript:
${transcript}

Please generate meeting notes with the following sections:
${sectionInstructions}

Respond only with the JSON object.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4_096,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  // Strip markdown code fences if present.
  const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  const parsed = JSON.parse(jsonText) as {
    summary: string
    sections: Array<{ title: string; content: string }>
  }

  return {
    summary: parsed.summary,
    sections: parsed.sections.map((s, order) => ({ ...s, order })),
  }
}

/**
 * Extract structured action items from a transcript using Claude.
 * Returns an empty array if none are found or JSON parsing fails.
 */
export async function extractActionItems(
  transcript: string,
  meetingTitle?: string
): Promise<ExtractedActionItem[]> {
  const systemPrompt = `You are an action item extraction assistant for Kolasys AI.
Extract every action item, task, and commitment made during the meeting.
Return ONLY a JSON array. If there are no action items, return [].
Each object must follow this shape exactly:
{
  "title": "<short task description, max 100 chars>",
  "description": "<optional longer explanation>",
  "assignee": "<person's name if clearly stated, otherwise omit the key>",
  "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "dueDate": "<YYYY-MM-DD if a specific date was mentioned, otherwise omit the key>"
}
Infer priority from urgency language: "urgent"/"ASAP" → URGENT, "important"/"soon" → HIGH, default → MEDIUM.`

  const userPrompt = `Meeting: ${meetingTitle ?? 'Untitled Meeting'}

Transcript:
${transcript}

Return the JSON array of action items only.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2_048,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    const items = JSON.parse(jsonText) as ExtractedActionItem[]
    return Array.isArray(items) ? items : []
  } catch {
    console.warn('[summarization] Failed to parse action items JSON — returning []')
    return []
  }
}

// ── Meeting title autogeneration ──────────────────────────────────────────
// Cheap Haiku call that produces a 5–8 word topical title for a recording.
// Returns null when the model gives nothing usable; caller leaves the
// existing title untouched in that case.
export async function generateAiMeetingTitle(args: {
  summary: string | null
  transcriptText: string
}): Promise<string | null> {
  const { summary, transcriptText } = args
  const haveSomething = (summary && summary.trim()) || transcriptText.trim()
  if (!haveSomething) return null

  const prompt =
    `Based on this meeting transcript and summary, generate a short, ` +
    `descriptive meeting title (5-8 words max). Be specific about what ` +
    `was discussed. Do not use generic phrases like "Meeting" or "Discussion". ` +
    `Return ONLY the title text, nothing else.\n\n` +
    `Summary: ${summary?.trim() || '(none yet)'}\n\n` +
    `Transcript excerpt: ${transcriptText.slice(0, 500)}`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = res.content[0]
    if (!block || block.type !== 'text') return null
    return cleanTitle(block.text)
  } catch (err) {
    console.error('[summarization] generateAiMeetingTitle failed:', err)
    return null
  }
}

/** Format the generated title with a leading "Mon D" date prefix:
 *  e.g. "May 4 — Q3 budget alignment". */
export function formatTitleWithDate(date: Date, aiTitle: string): string {
  const monthDay = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${monthDay} — ${aiTitle}`
}

function cleanTitle(raw: string): string | null {
  // Strip surrounding quotes Claude sometimes adds, trailing punctuation,
  // collapse internal whitespace, and cap at 120 chars defensively.
  const s = raw
    .replace(/^[\s"'`*_]+|[\s"'`*_.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return s || null
}
