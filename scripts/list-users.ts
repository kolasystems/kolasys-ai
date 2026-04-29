// Kolasys AI — Read-only inventory of orgs, members, and recording stats.
//
// Run via: npx tsx scripts/list-users.ts

import 'dotenv/config'
import { db } from '@/lib/db'

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 10)
}

function fmtDuration(secs: number): string {
  if (!secs) return '0s'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s'
}

async function main() {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, slug: true, plan: true, createdAt: true },
  })

  console.log(`Found ${orgs.length} organization(s).\n`)

  for (const org of orgs) {
    console.log('═'.repeat(72))
    console.log(`Org: ${org.name}`)
    console.log(`  id        ${org.id}`)
    console.log(`  slug      ${org.slug}`)
    console.log(`  plan      ${org.plan}`)
    console.log(`  created   ${fmtDate(org.createdAt)}`)

    // ── Members ─────────────────────────────────────────────────────────────
    const members = await db.orgMember.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, role: true, createdAt: true },
    })
    console.log(`\n  Members (${members.length}):`)
    if (members.length === 0) {
      console.log('    (none)')
    } else {
      for (const m of members) {
        console.log(
          `    · ${m.userId.padEnd(36)} ${m.role.padEnd(8)} joined ${fmtDate(m.createdAt)}`,
        )
      }
    }

    // ── Recordings: count, total duration, status breakdown ────────────────
    const recordings = await db.recording.findMany({
      where: { orgId: org.id },
      select: { status: true, duration: true },
    })

    const totalDuration = recordings.reduce((sum, r) => sum + (r.duration ?? 0), 0)
    const byStatus = recordings.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {})

    console.log(`\n  Recordings (${recordings.length}):`)
    console.log(`    total duration  ${fmtDuration(totalDuration)}`)
    if (recordings.length === 0) {
      console.log('    (no recordings yet)')
    } else {
      const ordered = ['PENDING', 'PROCESSING', 'TRANSCRIBING', 'SUMMARIZING', 'READY', 'FAILED']
      for (const status of ordered) {
        if (byStatus[status]) {
          console.log(`    ${status.padEnd(14)} ${byStatus[status]}`)
        }
      }
      // Catch any unexpected statuses
      for (const [status, n] of Object.entries(byStatus)) {
        if (!ordered.includes(status)) {
          console.log(`    ${status.padEnd(14)} ${n} (unexpected)`)
        }
      }
    }

    console.log('')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
