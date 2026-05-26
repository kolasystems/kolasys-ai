import 'dotenv/config'
import { db } from '../lib/db'
import { transcriptionQueue } from '../lib/queues'

// Recordings that hit Whisper's 25 MB 413 error
const IDS = [
  'cmp42d2sa000004jlwx7lmgeo',
  'cmp36bual000004ld17bxkazv',
]

async function main() {
  for (const id of IDS) {
    const rec = await db.recording.findUnique({
      where: { id },
      select: { id: true, orgId: true, s3Key: true, status: true },
    })
    if (!rec) { console.log(`NOT FOUND: ${id}`); continue }

    console.log(`Retrying ${id} (status=${rec.status})`)
    await db.recording.update({
      where: { id },
      data: { status: 'PENDING' },
    })
    await transcriptionQueue.add('transcribe', {
      recordingId: rec.id,
      orgId: rec.orgId,
      s3Key: rec.s3Key,
    })
    console.log(`  ✓ queued: ${id}`)
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
