// Kolasys AI — Knowledge graph tRPC router.
import 'server-only'

import { z } from 'zod'
import { router, orgProcedure } from '../trpc'
import { KnowledgeEntityType } from '@/generated/prisma/client'

// Keep the Zod input as string literals so tRPC's client type is a plain
// union and doesn't drag the Prisma enum into the bundle. The matching
// Prisma enum is applied server-side via a cast.
const entityTypeInput = z.enum(['PERSON', 'TOPIC', 'PROJECT'])

export const knowledgeRouter = router({
  // ── Top entities, optionally filtered by type ────────────────────────────
  getTopEntities: orgProcedure
    .input(
      z.object({
        type: entityTypeInput.optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.knowledgeEntity.findMany({
        where: {
          orgId: ctx.orgId,
          ...(input.type ? { type: input.type as KnowledgeEntityType } : {}),
        },
        orderBy: [{ mentions: 'desc' }, { lastSeen: 'desc' }],
        take: input.limit,
        select: {
          id: true,
          type: true,
          name: true,
          mentions: true,
          firstSeen: true,
          lastSeen: true,
          recordingLinks: { select: { recordingId: true } },
        },
      })
    }),

  // ── Entities mentioned in a single recording ──────────────────────────────
  getForRecording: orgProcedure
    .input(z.object({ recordingId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Scope by org via a join condition so we don't leak across orgs.
      const links = await ctx.db.knowledgeEntityRecording.findMany({
        where: {
          recordingId: input.recordingId,
          recording: { orgId: ctx.orgId },
        },
        orderBy: { mentions: 'desc' },
        include: { entity: true },
      })
      return links.map((l) => ({
        id: l.entity.id,
        type: l.entity.type,
        name: l.entity.name,
        mentions: l.mentions,
        totalMentions: l.entity.mentions,
      }))
    }),
})
