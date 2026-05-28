// Kolasys AI — Post-meeting AI suggestions (follow-ups, risks, commitments,
// sentiment). Runs on-demand when the user opens the Insights panel on a
// recording detail page. Cheaper + faster than Ask AI because it's a single
// non-streaming haiku call with a strict JSON contract.

import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { authenticateApiKey } from '@/lib/api-auth'

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export type Suggestions = {
  followUpQuestions: string[]
  risks: string[]
  commitments: Array<{ person: string; commitment: string }>
  sentiment: {
    overall: 'positive' | 'neutral' | 'mixed' | 'negative'
    keywords: string[]
  }
}

export async function POST(request: Request) {
  // Dual auth: Bearer API key (desktop app) tried first — it's a cheap header
  // check — falls back to Clerk session (web). Both branches resolve to the
  // internal DB org id so the downstream recording lookup is uniform.
  let orgId: string | null = null
  let userId: string | null = null

  const bearerAuth = await authenticateApiKey(request)
  if (bearerAuth) {
    orgId = bearerAuth.orgId
    // ApiKeyAuth (src/lib/api-auth.ts) has no userId field — use orgId as the
    // gate placeholder per the fallback in this route's spec.
    userId = bearerAuth.orgId
  } else {
    const session = await auth()
    userId = session.userId
    if (session.orgId) {
      // Clerk gives us the Clerk org id; translate to the internal DB id so
      // the recording lookup below matches the bearer branch's contract.
      const o = await db.organization.findFirst({
        where: { clerkOrgId: session.orgId },
        select: { id: true },
      })
      orgId = o?.id ?? null
    }
  }

  if (!userId || !orgId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { recordingId } = (await request.json()) as { recordingId?: string }
  if (!recordingId) {
    return Response.json({ error: 'Missing recordingId' }, { status: 400 })
  }

  const recording = await db.recording.findFirst({
    where: { id: recordingId, orgId },
    select: {
      id: true,
      title: true,
      transcript: { select: { text: true } },
    },
  })
  if (!recording?.transcript) {
    return Response.json({ error: 'No transcript' }, { status: 404 })
  }

  const note = await db.note.findFirst({
    where: { recordingId },
    orderBy: { createdAt: 'desc' },
    select: {
      actionItems: { select: { title: true } },
    },
  })
  const existingActions = note?.actionItems.map((a) => a.title).join(', ') || 'none'

  // Transcript can be enormous — trim to keep Haiku latency predictable.
  const transcriptSnippet = recording.transcript.text.slice(0, 6000)

  const response = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system:
      'You are a meeting intelligence assistant. Return ONLY valid JSON, no other text.',
    messages: [
      {
        role: 'user',
        content: `Analyze this meeting transcript and return insights as JSON.

Title: ${recording.title}
Existing action items: ${existingActions}
Transcript: ${transcriptSnippet}

Return JSON with exactly this shape:
{
  "followUpQuestions": ["question 1", "question 2"],
  "risks": ["risk or blocker mentioned"],
  "commitments": [{"person": "name", "commitment": "what they said they'd do"}],
  "sentiment": {"overall": "positive|neutral|mixed|negative", "keywords": ["word1", "word2"]}
}`,
      },
    ],
  })

  try {
    const first = response.content[0]
    const raw = first && first.type === 'text' ? first.text : ''
    // Strip markdown fences Haiku occasionally emits despite the system prompt.
    const clean = raw.replace(/```json|```/g, '').trim()
    const suggestions = JSON.parse(clean) as Suggestions
    return Response.json(suggestions)
  } catch (err) {
    console.error('[api/ai/suggestions] parse error:', err)
    return Response.json({ error: 'Parse error' }, { status: 500 })
  }
}
