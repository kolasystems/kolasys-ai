// Kolasys AI — Public REST API: live transcription of a single audio chunk.
// Auth: `Authorization: Bearer kol_…`
//
// POST /api/v1/transcribe-chunk — the desktop app posts a base64 webm batch
// (~10s of audio) every few seconds for live, near-real-time transcription.
//
// Each batch best-effort prepends the webm stream header, but the chunks may
// not be independently decodable. Whisper degrades gracefully on partial
// audio, so we hand it whatever bytes we got and return whatever text comes
// back. Any failure returns `{ text: '', duration: 0 }` with status 200 — the
// desktop silently ignores empty text, and a 4xx/5xx would only pollute logs.

import { writeFile, readFile, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

// fs + Blob/FormData require the Node runtime (not Edge).
export const runtime = 'nodejs'

type ChunkBody = {
  audio?: string // base64-encoded audio/webm
  mimeType?: string // 'audio/webm'
  language?: string // default 'en'
}

const EMPTY = { text: '', duration: 0 }

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  // Everything past auth is best-effort: on any failure return empty text
  // with a 200 so the desktop's polling loop stays quiet.
  let tmpPath: string | null = null
  try {
    const body = (await request.json()) as ChunkBody
    if (!body.audio) return Response.json(EMPTY)

    // 1. base64 → Buffer
    const buffer = Buffer.from(body.audio, 'base64')

    // 2. Write to a unique tmp file.
    tmpPath = `/tmp/chunk-${Date.now()}-${randomBytes(2).toString('hex')}.webm`
    await writeFile(tmpPath, buffer)

    // 3. Build the multipart form — append the tmp file as a Blob.
    const bytes = await readFile(tmpPath)
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: 'audio/webm' }), 'chunk.webm')
    form.append('model', 'whisper-1')
    form.append('response_format', 'json')
    form.append('language', body.language || 'en')

    // 4. POST to Whisper.
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    })
    if (!res.ok) {
      console.error('[v1/transcribe-chunk] whisper', res.status, await res.text().catch(() => ''))
      return Response.json(EMPTY)
    }

    const data = (await res.json()) as { text?: string }
    // 6. Whisper does not return a duration for response_format 'json'.
    return Response.json({ text: data.text || '', duration: 0 })
  } catch (err) {
    console.error('[v1/transcribe-chunk] failed:', err)
    return Response.json(EMPTY)
  } finally {
    // 5. Always clean up the tmp file.
    if (tmpPath) await unlink(tmpPath).catch(() => {})
  }
}
