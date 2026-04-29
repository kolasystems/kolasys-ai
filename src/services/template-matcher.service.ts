// Kolasys AI — Server-side auto-apply template matcher.
//
// The pure matcher lives in `@/lib/template-matcher` so it can be imported
// from client components without dragging Prisma into the browser bundle.
// This file adds a DB-backed convenience for the summarization worker.
//
// NOTE: no `import 'server-only'` here. The summarization worker is a
// standalone Node/tsx process — `server-only` throws unconditionally when
// loaded outside a Next.js bundle, which crashed the Railway worker on
// startup. Client safety is enforced by the lib/db import below (Prisma
// can't run in a browser anyway), not by the marker package.

import { db } from '@/lib/db'
import {
  pickAutoApplyTemplate,
  type AutoApplyRule,
  type MatchableTemplate,
} from '@/lib/template-matcher'

export { pickAutoApplyTemplate }
export type { AutoApplyRule, MatchableTemplate }

/**
 * Server-side convenience — loads candidate templates from the DB and runs
 * the pure matcher. Used by the summarization worker.
 */
export async function findBestTemplate(
  orgId: string,
  meetingTitle: string,
  attendees: string[] = [],
): Promise<string | null> {
  const templates = await db.noteTemplate.findMany({
    where: {
      OR: [{ orgId: null }, { orgId }],
      autoApplyRules: { not: null as never },
    },
    select: { id: true, name: true, autoApplyRules: true },
  })

  return pickAutoApplyTemplate(templates, meetingTitle, attendees)?.id ?? null
}
