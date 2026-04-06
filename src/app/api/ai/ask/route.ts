// Kolasys AI — Streaming Ask AI endpoint (Anthropic SDK + SSE)
// Returns an SSE stream with two event types:
//   { type: 'sources', sources: Source[] }  — sent first, before text
//   { type: 'text', text: string }           — streaming text chunks
//   { type: 'done' }                          — signals end

import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { embedText } from '@/services/embeddings.service'
import { ensureVectorSchema, vectorSimilaritySearch } from '@/lib/db-vector'
import { formatDuration } from '@/lib/utils'

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export async function POST(request: Request) {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true },
  })
  if (!org) {
    return Response.json({ error: 'Organization not found' }, { status: 404 })
  }

  const body = (await request.json()) as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    recordingId?: string
  }

  const { messages, recordingId } = body
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUserMessage) {
    return Response.json({ error: 'No user message' }, { status: 400 })
  }

  if (recordingId) {
    const rec = await db.recording.findFirst({
      where: { id: recordingId, orgId: org.id },
      select: { id: true },
    })
    if (!rec) return Response.json({ error: 'Recording not found' }, { status: 404 })
  }

  // ── Vector search ─────────────────────────────────────────────────────────
  type Source = {
    index: number
    recordingId: string
    recordingTitle: string
    chunkText: string
    startTime: number | null
    similarity: number
  }

  let sources: Source[] = []

  try {
    await ensureVectorSchema()
    const queryEmbedding = await embedText(lastUserMessage.content)
    const rows = await vectorSimilaritySearch({
      orgId: org.id,
      queryEmbedding,
      limit: 6,
      recordingId,
    })

    if (rows.length > 0) {
      const recIds = [...new Set(rows.map((r) => r.recordingId))]
      const recs = await db.recording.findMany({
        where: { id: { in: recIds }, orgId: org.id },
        select: { id: true, title: true },
      })
      const titleMap = Object.fromEntries(recs.map((r) => [r.id, r.title]))
      sources = rows.map((r, i) => ({
        index: i + 1,
        recordingId: r.recordingId,
        recordingTitle: titleMap[r.recordingId] ?? 'Unknown',
        chunkText: r.chunkText,
        startTime: r.startTime,
        similarity: r.similarity,
      }))
    }
  } catch (err) {
    console.error('[api/ai/ask] Vector search failed (non-fatal):', err)
  }

  // ── Build context and messages ────────────────────────────────────────────
  const contextSection = sources.length > 0
    ? sources
        .map((s) => {
          const time = s.startTime != null
            ? ` (${formatDuration(Math.floor(s.startTime))})`
            : ''
          return `[${s.index}] From "${s.recordingTitle}"${time}:\n${s.chunkText}`
        })
        .join('\n\n')
    : null

  const systemPrompt = contextSection
    ? `You are a helpful assistant for meeting notes. Answer questions using ONLY the provided transcript excerpts. Cite sources using [1], [2], etc. If the answer is not found in the context, say so.`
    : `You are a helpful assistant for meeting notes. No indexed content is available. Let the user know they may need to index their recordings first (click "Index for AI" on the recording detail page).`

  const anthropicMessages: Anthropic.MessageParam[] = [
    ...messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: 'user',
      content: contextSection
        ? `Transcript excerpts:\n${contextSection}\n\nQuestion: ${lastUserMessage.content}`
        : lastUserMessage.content,
    },
  ]

  // ── SSE stream ────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Send sources first
      if (sources.length > 0) {
        send({ type: 'sources', sources })
      }

      try {
        const anthropic = getAnthropic()
        const anthropicStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: anthropicMessages,
        })

        for await (const event of anthropicStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            send({ type: 'text', text: event.delta.text })
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Streaming error'
        send({ type: 'error', message: msg })
      }

      send({ type: 'done' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
