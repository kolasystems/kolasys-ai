// Kolasys AI — Knowledge graph extraction service.
// Asks Claude (Haiku — cheap + fast) to pull structured entities from a
// meeting transcript so the summarization worker can feed the graph.

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type KnowledgeExtraction = {
  people: string[] // ["John Smith", "Sarah Jones"]
  topics: string[] // ["product roadmap", "Q3 budget", "hiring"]
  projects: string[] // ["Project Atlas", "iOS app", "API v2"]
}

const EMPTY: KnowledgeExtraction = { people: [], topics: [], projects: [] }

export async function extractKnowledge(
  transcriptText: string,
  title: string,
): Promise<KnowledgeExtraction> {
  if (!transcriptText.trim()) return EMPTY

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: 'Extract structured data from meeting transcripts. Return ONLY valid JSON, no other text.',
    messages: [
      {
        role: 'user',
        content: `From this meeting transcript titled "${title}", extract:
1. People: full names of people mentioned or speaking (not generic titles)
2. Topics: key themes and subjects discussed (2-4 words each, lowercase)
3. Projects: specific project, product, or initiative names

Transcript (first 3000 chars):
${transcriptText.slice(0, 3000)}

Return JSON: {"people": [], "topics": [], "projects": []}`,
      },
    ],
  })

  // Only text content blocks carry extraction output.
  const first = response.content[0]
  if (!first || first.type !== 'text') return EMPTY

  try {
    const clean = first.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as Partial<KnowledgeExtraction>
    return {
      people: Array.isArray(parsed.people) ? parsed.people.filter((s): s is string => typeof s === 'string') : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter((s): s is string => typeof s === 'string') : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter((s): s is string => typeof s === 'string') : [],
    }
  } catch {
    return EMPTY
  }
}
