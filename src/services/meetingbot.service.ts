// Kolasys AI — Recall.ai meeting bot service

import { readFileSync } from 'fs'
import { join } from 'path'

// Account-region endpoint — the API key is registered to us-west-2, so all
// API calls (deploy / status / media URL) must hit this base. The bot's
// runtime region is set separately via `region` in the deploy body.
const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1'

// Recall.ai requires base64-encoded JPEG for automatic_video_output.
// bot_image_url is silently ignored — automatic_video_output is the
// correct field for a custom bot camera frame. Must be 16:9, kind: 'jpeg'.
// Image: public/bot-camera.jpg (1280×720, ~27KB).
function loadBotCameraB64(): string | null {
  try {
    const imgPath = join(process.cwd(), 'public', 'bot-camera.jpg')
    return readFileSync(imgPath).toString('base64')
  } catch {
    return null
  }
}
const BOT_CAMERA_B64 = loadBotCameraB64()

type RecallBot = {
  id: string
  status: string
  meeting_url: string
  bot_name: string
  video_url?: string
  transcript?: {
    speaker: string
    words: Array<{ text: string; start_time: number; end_time: number }>
  }[]
}

async function recallFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${RECALL_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${process.env.RECALLAI_API_KEY}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Recall.ai ${res.status}: ${body}`)
  }
  return res.json()
}

/**
 * Deploy a Recall.ai bot to a meeting URL.
 * Returns the bot ID to store on the Recording record.
 */
export async function deployBot(
  meetingUrl: string,
  recordingId: string,
  webhookUrl: string,
  botDisplayName: string = 'Kolasys AI'
): Promise<string> {
  // We transcribe with Whisper in our own worker, so we deliberately do NOT
  // ask Recall.ai to run their own transcription provider — both
  // `transcription_options` and `real_time_transcription` would invoke it.
  // The bot records, joins under the org's branded display name + avatar,
  // and notifies our webhook on status changes.
  const bot: RecallBot = await recallFetch('/bot/', {
    method: 'POST',
    body: JSON.stringify({
      meeting_url: meetingUrl,
      webhook_url: webhookUrl,
      bot_name: botDisplayName || 'Kolasys AI',
      ...(BOT_CAMERA_B64 && {
        automatic_video_output: {
          in_call_recording: { kind: 'jpeg', b64_data: BOT_CAMERA_B64 },
          in_call_not_recording: { kind: 'jpeg', b64_data: BOT_CAMERA_B64 },
        },
      }),
    }),
  })
  return bot.id
}

/** Remove a bot from a meeting early. */
export async function removeBot(botId: string): Promise<void> {
  await recallFetch(`/bot/${botId}/leave_call/`, { method: 'POST' })
}

/** Fetch the current bot status. */
export async function getBotStatus(botId: string): Promise<string> {
  const bot: RecallBot = await recallFetch(`/bot/${botId}/`)
  return bot.status
}

/** Fetch the bot's video download URL (available once the meeting ends). */
export async function getBotVideoUrl(botId: string): Promise<string | null> {
  const bot: RecallBot = await recallFetch(`/bot/${botId}/`)
  return bot.video_url ?? null
}

export type BotMediaRef = {
  url: string
  /** Best-guess content type. May still be wrong; the webhook re-checks the
   *  HTTP response's Content-Type when it actually fetches the bytes. */
  contentType: string
  extension: string
}

/**
 * Find the first usable media download URL on a Recall.ai bot. The API has
 * gone through several shapes — modern responses bury the URL under
 * `recordings[].media_shortcuts.{audio_only,video_only,video}.data.download_url`
 * while older ones expose `bot.video_url` directly. We prefer audio-only
 * (smaller, faster Whisper) and fall back through every known location.
 */
export async function getBotMediaUrl(botId: string): Promise<BotMediaRef | null> {
  const bot = await recallFetch(`/bot/${botId}/`)

  const candidates: Array<{ url: string; preferred: boolean }> = []

  // Newer shape: bot.recordings[].media_shortcuts.{audio_only|video_only|video}
  const recordings: unknown[] = Array.isArray(
    (bot as { recordings?: unknown }).recordings,
  )
    ? ((bot as { recordings: unknown[] }).recordings)
    : []
  for (const rec of recordings) {
    const ms = (rec as { media_shortcuts?: Record<string, unknown> })?.media_shortcuts
    if (!ms) continue
    const audioUrl = readDownloadUrl(ms.audio_only)
    if (audioUrl) candidates.push({ url: audioUrl, preferred: true })
    const videoOnly = readDownloadUrl(ms.video_only)
    if (videoOnly) candidates.push({ url: videoOnly, preferred: false })
    const video = readDownloadUrl(ms.video)
    if (video) candidates.push({ url: video, preferred: false })
  }

  // Legacy shape: bot.video_url (string).
  const legacy = (bot as { video_url?: string }).video_url
  if (legacy) candidates.push({ url: legacy, preferred: false })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => Number(b.preferred) - Number(a.preferred))
  const winner = candidates[0]
  return inferMediaShape(winner.url)
}

function readDownloadUrl(node: unknown): string | null {
  const data = (node as { data?: unknown })?.data
  const url = (data as { download_url?: unknown })?.download_url
  return typeof url === 'string' && url.length > 0 ? url : null
}

function inferMediaShape(url: string): BotMediaRef {
  // Strip the query string before sniffing the extension — Recall's signed
  // URLs include long ?Signature=… tails.
  const path = url.split('?')[0].toLowerCase()
  if (path.endsWith('.m4a')) return { url, contentType: 'audio/mp4', extension: 'm4a' }
  if (path.endsWith('.mp3')) return { url, contentType: 'audio/mpeg', extension: 'mp3' }
  if (path.endsWith('.wav')) return { url, contentType: 'audio/wav', extension: 'wav' }
  if (path.endsWith('.webm')) return { url, contentType: 'video/webm', extension: 'webm' }
  // Default to mp4 — Whisper accepts the audio track from mp4 directly.
  return { url, contentType: 'video/mp4', extension: 'mp4' }
}
