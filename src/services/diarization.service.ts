// Kolasys AI — Speaker diarization via Deepgram REST API
// Calls Deepgram's pre-recorded transcription API with diarize=true.
// After Whisper transcription, maps speaker IDs back to existing segments by timestamp.
// This service is optional — if DEEPGRAM_API_KEY is not set, it is skipped.

export type SpeakerWord = {
  word: string
  start: number  // seconds
  end: number    // seconds
  speaker: number // 0, 1, 2, ...
}

type DeepgramWord = {
  word: string
  start: number
  end: number
  speaker?: number
  confidence?: number
}

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        words?: DeepgramWord[]
      }>
    }>
  }
  err_code?: string
  err_msg?: string
}

/**
 * Send audio buffer to Deepgram with diarization enabled.
 * Returns an array of words with speaker IDs and timestamps.
 */
export async function diarizeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<SpeakerWord[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set')

  const url =
    'https://api.deepgram.com/v1/listen?diarize=true&model=nova-2&language=en&smart_format=false&punctuate=false'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mimeType || 'audio/webm',
    },
    body: audioBuffer as unknown as BodyInit,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Deepgram API error (${response.status}): ${body}`)
  }

  const data = (await response.json()) as DeepgramResponse

  if (data.err_code) {
    throw new Error(`Deepgram error ${data.err_code}: ${data.err_msg ?? 'unknown'}`)
  }

  const words = data.results?.channels?.[0]?.alternatives?.[0]?.words ?? []

  return words
    .filter((w) => w.speaker !== undefined)
    .map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      speaker: w.speaker!,
    }))
}

/**
 * Map Deepgram speaker words to transcript segments by timestamp overlap.
 * For each segment, finds the dominant speaker among words that overlap it.
 * Returns an array parallel to `segments` with a speaker number (or null).
 */
export function mapSpeakersToSegments(
  segments: Array<{ startTime: number; endTime: number }>,
  speakerWords: SpeakerWord[]
): Array<number | null> {
  return segments.map((seg) => {
    const overlapping = speakerWords.filter(
      (w) => w.end > seg.startTime && w.start < seg.endTime
    )
    if (overlapping.length === 0) return null

    // Tally vote — pick the speaker with the most overlapping words
    const tally: Record<number, number> = {}
    for (const w of overlapping) {
      tally[w.speaker] = (tally[w.speaker] ?? 0) + 1
    }
    const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
    return winner ? Number(winner[0]) : null
  })
}
