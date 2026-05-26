import 'dotenv/config'
import { transcriptionQueue } from '../lib/queues'

// Remove the stale old job IDs (pre-retry) so each recording only has one queued job
const STALE_JOB_IDS = ['41', '42', '43']

async function main() {
  for (const id of STALE_JOB_IDS) {
    try {
      const job = await transcriptionQueue.getJob(id)
      if (job) {
        await job.remove()
        console.log(`Removed stale job ${id} (recordingId: ${job.data.recordingId})`)
      } else {
        console.log(`Job ${id} not found (already gone)`)
      }
    } catch (e) {
      console.error(`Failed to remove job ${id}:`, e)
    }
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
