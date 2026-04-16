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
