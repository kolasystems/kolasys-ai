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
        botDisplayName: true,
        ssoEnabled: true,
        ssoDomain: true,
        samlMetadataUrl: true,
      },
    })
    if (!org) throw new TRPCError({ code: 'NOT_FOUND' })
    return {
      deleteAudioAfterTranscription: org.deleteAudioAfterTranscription,
      postMeetingEmail: org.postMeetingEmail,
      dailyDigest: org.dailyDigest,
      defaultTranscriptionLanguage: org.defaultTranscriptionLanguage,
      botDisplayName: org.botDisplayName,
      ssoEnabled: org.ssoEnabled,
      ssoDomain: org.ssoDomain,
      samlMetadataUrl: org.samlMetadataUrl,
    }
  }),

  // ── Register the Expo push token from the mobile app ─────────────────────
  // The mobile app calls this on launch after resolving the device token.
  // Used by the summarization worker to notify the watch/phone when notes
  // are ready.
  updatePushToken: orgProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: { expoPushToken: input.token },
      })
      return { ok: true }
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
          botDisplayName: z.string().min(1).max(64).optional(),
          ssoEnabled: z.boolean().optional(),
          // domain + metadata are nullable so the UI can clear them explicitly
          ssoDomain: z.string().max(253).nullable().optional(),
          samlMetadataUrl: z.string().url().max(2048).nullable().optional(),
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
          ...(input.botDisplayName !== undefined && {
            botDisplayName: input.botDisplayName,
          }),
          ...(input.ssoEnabled !== undefined && {
            ssoEnabled: input.ssoEnabled,
          }),
          ...(input.ssoDomain !== undefined && {
            ssoDomain: input.ssoDomain,
          }),
          ...(input.samlMetadataUrl !== undefined && {
            samlMetadataUrl: input.samlMetadataUrl,
          }),
        },
        select: {
          deleteAudioAfterTranscription: true,
          postMeetingEmail: true,
          dailyDigest: true,
          defaultTranscriptionLanguage: true,
          botDisplayName: true,
          ssoEnabled: true,
          ssoDomain: true,
          samlMetadataUrl: true,
        },
      })
      return updated
    }),
})
