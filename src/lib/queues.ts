// Kolasys AI — BullMQ queues

import { Queue } from 'bullmq'
import { bullmqConnection } from './redis'

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3_600 },   // keep 24 h
  removeOnFail: { age: 7 * 24 * 3_600 },   // keep 7 days for inspection
}

export const transcriptionQueue = new Queue('transcription', {
  connection: bullmqConnection,
  defaultJobOptions,
})

export const summarizationQueue = new Queue('summarization', {
  connection: bullmqConnection,
  defaultJobOptions,
})

// Bot ingestion: pulls the recorded media from Recall.ai → S3 → kicks off
// the existing transcription queue. Runs on Railway alongside the
// transcription worker so the Recall.ai webhook on Vercel can fire-and-
// forget without ever holding the response open for the download.
export const botIngestionQueue = new Queue('bot-ingestion', {
  connection: bullmqConnection,
  defaultJobOptions,
})

export type TranscriptionQuality = 'standard' | 'high'

export type TranscriptionJobData = {
  recordingId: string
  orgId: string
  s3Key: string
  language?: string
  quality?: TranscriptionQuality
}

export type SummarizationJobData = {
  recordingId: string
  transcriptId: string
  templateId?: string
}

export type BotIngestionJobData = {
  botId: string
}
