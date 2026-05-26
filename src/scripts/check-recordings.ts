import 'dotenv/config'
import { db } from '../lib/db'

async function main() {
  const recordings = await db.recording.findMany({
    where: { createdAt: { gte: new Date('2026-05-21T17:00:00Z') } },
    select: { id: true, title: true, status: true, s3Key: true, mimeType: true, fileSize: true },
    orderBy: { createdAt: 'desc' }
  })
  console.log(JSON.stringify(recordings, null, 2))
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
