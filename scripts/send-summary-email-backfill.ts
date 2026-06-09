// Kolasys AI — One-off backfill: send summary email for already-READY recordings.
//
// Usage:
//   npx tsx scripts/send-summary-email-backfill.ts <recordingId> [<recordingId> ...]
//
// Existing idempotency (summaryEmailSentAt) and all service-level guards
// (RESEND_API_KEY presence, org/user toggles) are honoured — this script
// does not bypass them.

import 'dotenv/config'
import { sendSummaryEmail } from '@/services/summary-email.service'

const ids = process.argv.slice(2)

if (ids.length === 0) {
  console.error('Usage: npx tsx scripts/send-summary-email-backfill.ts <id> [<id> ...]')
  process.exit(1)
}

console.log(`Backfill: ${ids.length} recording(s)`)

let sent = 0
let skipped = 0
let failed = 0

for (const id of ids) {
  try {
    await sendSummaryEmail(id)
    // The service logs "[summary-email] Sent to …" on success and
    // "[summary-email] Already sent …" / "[summary-email] … skipping" on skip.
    // We just count outcomes here.
    sent++
    console.log(`  ✓ ${id}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${id}:`, err instanceof Error ? err.message : String(err))
  }
}

// The service logs its own skip reasons inline; we capture the count by
// comparing expected vs actual sends. For a precise sent/skipped breakdown
// the service would need to return a status — for a one-off backfill, the
// inline logs are sufficient.
console.log(`\nDone. attempted=${ids.length} ok=${sent} failed=${failed}`)
process.exit(failed > 0 ? 1 : 0)
