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
      select: {
        deleteAudioAfterTranscription: true,
        postMeetingEmail: true,
        dailyDigest: true,
        defaultTranscriptionLanguage: true,
      },
    })
    if (!org) throw new TRPCError({ code: 'NOT_FOUND' })
    return {
      deleteAudioAfterTranscription: org.deleteAudioAfterTranscription,
      postMeetingEmail: org.postMeetingEmail,
      dailyDigest: org.dailyDigest,
      defaultTranscriptionLanguage: org.defaultTranscriptionLanguage,
    }
  }),

  // ── Update org-level preferences ──────────────────────────────────────────
  updateOrgSettings: orgProcedure
    .input(
      z
        .object({
          deleteAudioAfterTranscription: z.boolean().optional(),
          postMeetingEmail: z.boolean().optional(),
          dailyDigest: z.boolean().optional(),
          defaultTranscriptionLanguage: z.string().min(2).max(10).optional(),
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
          ...(input.postMeetingEmail !== undefined && {
            postMeetingEmail: input.postMeetingEmail,
          }),
          ...(input.dailyDigest !== undefined && {
            dailyDigest: input.dailyDigest,
          }),
          ...(input.defaultTranscriptionLanguage !== undefined && {
            defaultTranscriptionLanguage: input.defaultTranscriptionLanguage,
          }),
        },
        select: {
          deleteAudioAfterTranscription: true,
          postMeetingEmail: true,
          dailyDigest: true,
          defaultTranscriptionLanguage: true,
        },
      })
      return updated
    }),
})
