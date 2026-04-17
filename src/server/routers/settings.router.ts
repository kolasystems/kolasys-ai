// Kolasys AI — Organization-level settings tRPC router
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'

export const settingsRouter = router({
  // ── Read current org-level preferences ────────────────────────────────────
  getOrgSettings: orgProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
      select: { deleteAudioAfterTranscription: true },
    })
    if (!org) throw new TRPCError({ code: 'NOT_FOUND' })
    return { deleteAudioAfterTranscription: org.deleteAudioAfterTranscription }
  }),

  // ── Update org-level preferences ──────────────────────────────────────────
  updateOrgSettings: orgProcedure
    .input(
      z
        .object({
          deleteAudioAfterTranscription: z.boolean().optional(),
        })
        .refine((v) => Object.keys(v).length > 0, {
          message: 'At least one field must be provided.',
        })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: {
          ...(input.deleteAudioAfterTranscription !== undefined && {
            deleteAudioAfterTranscription: input.deleteAudioAfterTranscription,
          }),
        },
        select: { deleteAudioAfterTranscription: true },
      })
      return updated
    }),
})
