// Kolasys AI — AI search + Ask AI tRPC router
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'
import { embedText, chunkSegments, chunkText, type TextChunk } from '@/services/embeddings.service'
import {
  ensureVectorSchema,
  insertEmbedding,
  vectorSimilaritySearch,
  deleteEmbeddingsForRecording,
  type EmbeddingRow,
} from '@/lib/db-vector'
import Anthropic from '@anthropic-ai/sdk'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export const searchRouter = router({
  // ── Generate and store embeddings for a recording's transcript ─────────────
  generateEmbeddings: orgProcedure
    .input(z.object({ recordingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const transcript = await ctx.db.transcript.findFirst({
        where: { recordingId: input.recordingId, recording: { orgId: ctx.orgId } },
        select: {
          id: true,
          text: true,
          segments: { select: { text: true, startTime: true, endTime: true }, orderBy: { startTime: 'asc' } },
        },
      })

      if (!transcript) throw new TRPCError({ code: 'NOT_FOUND', message: 'Transcript not found' })

      await ensureVectorSchema()

      // Clear any existing embeddings for this recording before re-generating
      await deleteEmbeddingsForRecording(input.recordingId)

      let chunks: TextChunk[]
      if (transcript.segments.length > 0) {
        chunks = chunkSegments(transcript.segments, 500)
      } else {
        chunks = chunkText(transcript.text, 500, 100)
      }

      let stored = 0
      for (const chunk of chunks) {
        try {
          const embedding = await embedText(chunk.text)
          await insertEmbedding({
            orgId: ctx.orgId,
            recordingId: input.recordingId,
            chunkIndex: chunk.chunkIndex,
            chunkText: chunk.text,
            embedding,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
          })
          stored++
        } catch (err) {
          console.error(`[search] Failed to embed chunk ${chunk.chunkIndex}:`, err)
        }
      }

      return { stored, total: chunks.length }
    }),

  // ── Ask AI — vector search + Claude answer ─────────────────────────────────
  // Non-streaming version used for programmatic access. The chat UI uses the
  // /api/ai/ask streaming endpoint instead.
  askAI: orgProcedure
    .input(
      z.object({
        question: z.string().min(1).max(1000),
        recordingId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureVectorSchema()

      const queryEmbedding = await embedText(input.question)

      let sources: EmbeddingRow[] = []
      try {
        sources = await vectorSimilaritySearch({
          orgId: ctx.orgId,
          queryEmbedding,
          limit: 6,
          recordingId: input.recordingId,
        })
      } catch (err) {
        console.error('[search.askAI] Vector search failed:', err)
        // Fall through with empty sources — Claude can still answer from the question
      }

      // Fetch recording titles for citations
      const recordingIds = [...new Set(sources.map((s) => s.recordingId))]
      const recordings = await ctx.db.recording.findMany({
        where: { id: { in: recordingIds }, orgId: ctx.orgId },
        select: { id: true, title: true },
      })
      const titleMap = Object.fromEntries(recordings.map((r) => [r.id, r.title]))

      const contextBlocks = sources.map((s, i) => {
        const title = titleMap[s.recordingId] ?? 'Unknown Recording'
        const time = s.startTime != null ? ` (at ${Math.floor(s.startTime / 60)}:${String(Math.floor(s.startTime % 60)).padStart(2, '0')})` : ''
        return `[${i + 1}] From "${title}"${time}:\n${s.chunkText}`
      })

      const systemPrompt = sources.length > 0
        ? `You are a helpful assistant for meeting notes. Answer questions using ONLY the provided transcript excerpts. Cite sources using [1], [2], etc. If the answer is not found in the provided context, say so clearly.`
        : `You are a helpful assistant for meeting notes. The user's recordings haven't been indexed yet (no embeddings generated). Politely suggest they generate embeddings first via the "Generate Embeddings" button on the recording detail page.`

      const userContent = sources.length > 0
        ? `Transcript excerpts:\n${contextBlocks.join('\n\n')}\n\nQuestion: ${input.question}`
        : input.question

      const anthropic = getAnthropic()
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      })

      const answer =
        response.content[0]?.type === 'text' ? response.content[0].text : ''

      return {
        answer,
        sources: sources.map((s, i) => ({
          index: i + 1,
          recordingId: s.recordingId,
          recordingTitle: titleMap[s.recordingId] ?? 'Unknown Recording',
          chunkText: s.chunkText,
          startTime: s.startTime,
          similarity: s.similarity,
        })),
      }
    }),
})
