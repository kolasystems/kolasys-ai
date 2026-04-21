// Kolasys AI — Transcription service (OpenAI Whisper)

import OpenAI from 'openai'
import { Readable } from 'stream'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type TranscriptWord = {
  word: string
  start: number
  end: number
}

export type TranscriptSegment = {
  speaker?: string
  text: string
  startTime: number
  endTime: number
  confidence?: number
  // Word-level timestamps inside this segment (Whisper word granularity).
  // Empty when the provider can't produce per-word timings.
  words?: TranscriptWord[]
}

export type TranscriptionResult = {
  text: string
  language: string
  duration?: number
  segments: TranscriptSegment[]
}

export type TranscriptionOptions = {
  language?: string
  // Kept for forward-compatibility — word granularity is now always requested
  // so clicking a word in the transcript can seek the audio player. Quality
  // is still accepted by callers but no longer changes the Whisper request.
  quality?: 'standard' | 'high'
}

/**
 * Transcribe an audio buffer using OpenAI Whisper.
 * Returns the full transcript text and per-segment data with word timings.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const language = options.language ?? 'en'
  // Always request both segment and word granularity — the word timings power
  // click-to-seek in the transcript UI. The extra cost is negligible.
  const granularities: Array<'segment' | 'word'> = ['segment', 'word']

  // Whisper expects a File-like object with a name property.
  // Wrap in Uint8Array so the buffer type is narrowed to ArrayBuffer (not SharedArrayBuffer).
  const file = new File([new Uint8Array(audioBuffer)], filename, { type: mimeTypeFromFilename(filename) })

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language,
    response_format: 'verbose_json',
    timestamp_granularities: granularities,
  })

  // Whisper returns `words` as a flat array across the whole transcript when
  // word granularity is requested. We redistribute them into their containing
  // segment using start-time overlap — a word belongs to the segment whose
  // [start, end) range contains the word's start time.
  const allWords: TranscriptWord[] = (response.words ?? []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }))

  const segments: TranscriptSegment[] = (response.segments ?? []).map((seg) => ({
    text: seg.text.trim(),
    startTime: seg.start,
    endTime: seg.end,
    // Whisper doesn't return per-segment confidence, but avg_logprob is a proxy.
    confidence: seg.avg_logprob !== undefined ? logprobToConfidence(seg.avg_logprob) : undefined,
    words: allWords.filter((w) => w.start >= seg.start && w.start < seg.end),
  }))

  return {
    text: response.text,
    language: response.language ?? language,
    duration: response.duration,
    segments,
  }
}

function mimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
  }
  return map[ext ?? ''] ?? 'audio/mpeg'
}

function logprobToConfidence(logprob: number): number {
  // avg_logprob is typically in [-1, 0]; map to [0, 1].
  return Math.max(0, Math.min(1, 1 + logprob))
}
