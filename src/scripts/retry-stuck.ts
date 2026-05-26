import 'dotenv/config'
import { db } from '../lib/db'
import { transcriptionQueue } from '../lib/queues'

const IDS = [
  'cmpfsnv1j000004l7pm8utgb0',
  'cmpfsgts8000104l5r24kpvgq',
  'cmpfseffu000004l5fibmgag9',
  'cmpfr7k0z000004lba0r0bm79',
]

async function main() {
  for (const id of IDS) {
    const rec = await db.recording.findUnique({
      where: { id },
      select: { id: true, orgId: true, s3Key: true, status: true, mimeType: true },
    })
    if (!rec) { console.log(`NOT FOUND: ${id}`); continue }

    console.log(`Retrying ${id} (was ${rec.status}, mimeType=${rec.mimeType})`)

    await db.recording.update({
      where: { id },
      data: { status: 'PENDING', mimeType: 'audio/webm' },
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
