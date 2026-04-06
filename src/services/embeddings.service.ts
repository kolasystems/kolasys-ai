// Kolasys AI — Embeddings service (OpenAI text-embedding-3-small)

import OpenAI from 'openai'

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

/** Generate a 1536-dimension embedding for a text string. */
export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // safety trim — model limit is 8192 tokens
  })
  return response.data[0].embedding
}

export type TextChunk = {
  text: string
  chunkIndex: number
  startTime?: number | null
  endTime?: number | null
}

/**
 * Chunk transcript segments into ~500-char overlapping pieces.
 * Groups segments until the text exceeds targetSize, then starts a new chunk
 * with a 1-segment overlap so context isn't lost at boundaries.
 */
export function chunkSegments(
  segments: Array<{ text: string; startTime: number; endTime: number }>,
  targetSize = 500
): TextChunk[] {
  if (segments.length === 0) return []

  const chunks: TextChunk[] = []
  let buffer = ''
  let bufStart: number | null = null
  let bufEnd: number | null = null
  let chunkIndex = 0

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (bufStart === null) bufStart = seg.startTime
    bufEnd = seg.endTime
    buffer += (buffer ? ' ' : '') + seg.text.trim()

    if (buffer.length >= targetSize) {
      chunks.push({ text: buffer, chunkIndex, startTime: bufStart, endTime: bufEnd })
      chunkIndex++
      // Overlap: step back one segment to provide boundary context
      i = Math.max(i - 1, i)
      buffer = ''
      bufStart = null
      bufEnd = null
    }
  }

  if (buffer.trim()) {
    chunks.push({ text: buffer.trim(), chunkIndex, startTime: bufStart, endTime: bufEnd })
  }

  return chunks
}

/**
 * Chunk a plain text string (no segment timestamps) into ~500-char pieces
 * with 100-char overlap. Used when only full transcript text is available.
 */
export function chunkText(text: string, chunkSize = 500, overlap = 100): TextChunk[] {
  const chunks: TextChunk[] = []
  let i = 0
  let chunkIndex = 0

  while (i < text.length) {
    const slice = text.slice(i, i + chunkSize)
    if (slice.trim()) {
      chunks.push({ text: slice.trim(), chunkIndex })
      chunkIndex++
    }
    i += chunkSize - overlap
    if (i + overlap >= text.length && i < text.length) {
      const last = text.slice(i).trim()
      if (last) chunks.push({ text: last, chunkIndex })
      break
    }
  }

  return chunks
}
