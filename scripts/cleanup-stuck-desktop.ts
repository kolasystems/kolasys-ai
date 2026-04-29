// Kolasys AI — One-off cleanup: mark abandoned desktop-app recordings FAILED.
//
// Run via: npx tsx scripts/cleanup-stuck-desktop.ts
//
// A "stuck" desktop recording is one that was created via POST /api/v1/recordings
// (source=DESKTOP, status=PENDING) but whose audio bytes were never PUT to S3,
// so the row has no s3Key. Without this, the dashboard renders them as
// perpetually pending. We don't delete — just flip to FAILED so they fall out
// of "in-progress" filters but stay visible in audit history.
//
// HTTP-mode Prisma → no updateMany (BullMQ-style transaction wrapper).
// Loop sequentially.

import 'dotenv/config'
import { db } from '@/lib/db'

async function main() {
  const stuck = await db.recording.findMany({
    where: {
      source: 'DESKTOP',
      status: 'PENDING',
      s3Key: null,
    },
    select: { id: true, orgId: true, title: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${stuck.length} stuck DESKTOP/PENDING recording(s) with no s3Key.`)
  if (stuck.length === 0) return

  for (const r of stuck) {
    const age = Math.round((Date.now() - r.createdAt.getTime()) / 60_000)
    console.log(`  · ${r.id} — "${r.title}" (org ${r.orgId}, ${age} min old)`)
  }

  let updated = 0
  for (const r of stuck) {
    try {
      await db.recording.update({
        where: { id: r.id },
        data: { status: 'FAILED' },
      })
      updated++
    } catch (err) {
      console.error(`  ✗ ${r.id} — failed to update:`, err)
    }
  }

  console.log(`\n✓ Marked ${updated}/${stuck.length} recording(s) FAILED.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
