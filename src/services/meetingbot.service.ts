// Kolasys AI — Recall.ai meeting bot service

const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1'

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
  const bot: RecallBot = await recallFetch('/bot/', {
    method: 'POST',
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botDisplayName,
      transcription_options: { provider: 'default' },
      real_time_transcription: {
        destination_url: webhookUrl,
        partial_results: false,
      },
      metadata: { recordingId },
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
