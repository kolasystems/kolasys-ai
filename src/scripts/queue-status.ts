import 'dotenv/config'
import { transcriptionQueue } from '../lib/queues'

async function main() {
  const counts = await transcriptionQueue.getJobCounts(
    'waiting', 'active', 'completed', 'failed', 'delayed'
  )
  console.log('Transcription queue counts:', counts)

  const waiting = await transcriptionQueue.getWaiting(0, 20)
  const active  = await transcriptionQueue.getActive(0, 20)
  const failed  = await transcriptionQueue.getFailed(0, 10)

  console.log('\nWaiting jobs:')
  for (const j of waiting) {
    console.log(`  ${j.id} — recordingId: ${j.data.recordingId}`)
  }
  console.log('\nActive jobs:')
  for (const j of active) {
    console.log(`  ${j.id} — recordingId: ${j.data.recordingId}`)
  }
  console.log('\nFailed jobs (last 10):')
  for (const j of failed) {
    console.log(`  ${j.id} — recordingId: ${j.data.recordingId} — ${j.failedReason}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
