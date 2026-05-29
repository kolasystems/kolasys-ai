// Kolasys AI — Public REST API: short-lived Deepgram token for live transcription.
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/transcribe/token — mints a 60-second Deepgram key the desktop
// app uses to open a WebSocket directly to Deepgram for streaming live
// transcription. Keeps the long-lived DEEPGRAM_API_KEY server-side; a leaked
// temp token can only stream for 60s before Deepgram rejects it.
//
// Deepgram already powers the diarization step in the transcription worker
// (src/services/diarization.service.ts) — same DEEPGRAM_API_KEY env var.

import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

const TTL_SECONDS = 60

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    console.error('[v1/transcribe/token] DEEPGRAM_API_KEY not set')
    return Response.json(
      { error: 'Live transcription is not configured on this server.' },
      { status: 503 },
    )
  }

  let res: Response
  try {
    res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ time_to_live: TTL_SECONDS }),
    })
  } catch (err) {
    console.error('[v1/transcribe/token] fetch to Deepgram threw:', err)
    return Response.json(
      { error: 'Deepgram token request failed.' },
      { status: 502 },
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(
      `[v1/transcribe/token] Deepgram ${res.status}: ${body.slice(0, 200)}`,
    )
    return Response.json(
      { error: 'Deepgram token request failed.' },
      { status: 502 },
    )
  }

  // Deepgram's auth/grant docs show `access_token`; some SDK versions surface
  // `key`. Accept either, fall back through, fail closed if none present.
  const data = (await res.json().catch(() => null)) as
    | { access_token?: string; key?: string; token?: string }
    | null
  const token = data?.access_token ?? data?.key ?? data?.token ?? null
  if (!token) {
    console.error('[v1/transcribe/token] Deepgram returned no token field:', data)
    return Response.json(
      { error: 'Deepgram token request failed.' },
      { status: 502 },
    )
  }

  // no-store so the temp token never lands in any proxy/CDN cache.
  return Response.json(
    { token, expiresIn: TTL_SECONDS },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
