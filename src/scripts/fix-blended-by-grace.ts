import 'dotenv/config'
import { db } from '../lib/db'
import { transcriptionQueue } from '../lib/queues'

async function main() {
  const org = await db.organization.findFirst({
    where: { name: { contains: 'Blended', mode: 'insensitive' } },
    select: { id: true, name: true }
  })
  console.log('Org:', org)

  if (org) {
    const recordings = await db.recording.findMany({
      where: { orgId: org.id },
      select: { id: true, title: true, status: true, s3Key: true, mimeType: true, fileSize: true }
    })
    console.log('Recordings:', JSON.stringify(recordings, null, 2))

    for (const r of recordings) {
      if (['PROCESSING', 'FAILED', 'PENDING'].includes(r.status)) {
        await db.recording.update({
          where: { id: r.id },
          data: { status: 'PENDING' }
        })
        await transcriptionQueue.add('transcribe', {
          recordingId: r.id,
          orgId: org.id,
          s3Key: r.s3Key,
        })
        console.log('Retried:', r.id, r.title)
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
