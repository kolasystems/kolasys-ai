// Kolasys AI — Organization-level settings tRPC router
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'
import { getSignedDownloadUrl } from '@/lib/storage'
import { renderBotAvatar } from '@/services/bot-avatar.service'
import { uploadToS3, downloadFromS3 } from '@/lib/storage'

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
        autoRecordMeetings: true,
        ssoEnabled: true,
        ssoDomain: true,
        samlMetadataUrl: true,
        internalJargon: true,
        companyDescription: true,
        autoDeleteTranscriptsDays: true,
      },
    })
    if (!org) throw new TRPCError({ code: 'NOT_FOUND' })

    const member = await ctx.db.orgMember.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId },
      select: { id: true },
    })

    return {
      memberId: member?.id ?? null,
      deleteAudioAfterTranscription: org.deleteAudioAfterTranscription,
      postMeetingEmail: org.postMeetingEmail,
      dailyDigest: org.dailyDigest,
      defaultTranscriptionLanguage: org.defaultTranscriptionLanguage,
      botDisplayName: org.botDisplayName,
      autoRecordMeetings: org.autoRecordMeetings,
      ssoEnabled: org.ssoEnabled,
      ssoDomain: org.ssoDomain,
      samlMetadataUrl: org.samlMetadataUrl,
      internalJargon: org.internalJargon,
      companyDescription: org.companyDescription,
      autoDeleteTranscriptsDays: org.autoDeleteTranscriptsDays,
    }
  }),

  // ── Member bot identity ───────────────────────────────────────────────────

  getMemberBotSettings: orgProcedure.query(async ({ ctx }) => {
    const member = await ctx.db.orgMember.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId },
      select: { botDisplayName: true, botAvatarS3Key: true, emailSummaryOnReady: true },
    })
    const avatarUrl = member?.botAvatarS3Key
      ? await getSignedDownloadUrl(member.botAvatarS3Key, 3600).catch(() => null)
      : null
    return {
      botDisplayName: member?.botDisplayName ?? null,
      botAvatarUrl: avatarUrl,
      emailSummaryOnReady: member?.emailSummaryOnReady ?? true,
    }
  }),

  updateMemberBotDisplayName: orgProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.orgMember.findFirst({
        where: { orgId: ctx.orgId, userId: ctx.userId },
        select: { id: true, botAvatarS3Key: true },
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.db.orgMember.update({
        where: { id: member.id },
        data: { botDisplayName: input.name },
      })

      // Re-render avatar with new name if one exists
      if (member.botAvatarS3Key) {
        try {
          // Find the original logo by downloading the current avatar — instead,
          // we store the original logo separately. For now skip re-render; the
          // next upload will pick up the new name automatically.
          void member // satisfies linter
        } catch {
          // Non-fatal
        }
      }

      return { ok: true }
    }),

  // ── Toggle per-user summary email ────────────────────────────────────────
  updateEmailSummaryOnReady: orgProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.orgMember.findFirst({
        where: { orgId: ctx.orgId, userId: ctx.userId },
        select: { id: true },
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.db.orgMember.update({
        where: { id: member.id },
        data: { emailSummaryOnReady: input.enabled },
      })

      return { ok: true, emailSummaryOnReady: input.enabled }
    }),

  // ── Register the Expo push token from the mobile app ─────────────────────
  // The mobile app calls this on launch after resolving the device token.
  // Stored per-member (orgId + Clerk userId) so each user's own iPhone +
  // Apple Watch get pinged when their own recordings finish processing.
  updatePushToken: orgProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // HTTP-mode Prisma has no upsert / no updateMany; use the @@unique
      // (orgId, userId) lookup + branch sequentially.
      const member = await ctx.db.orgMember.findFirst({
        where: { orgId: ctx.orgId, userId: ctx.userId },
        select: { id: true },
      })
      if (member) {
        await ctx.db.orgMember.update({
          where: { id: member.id },
          data: { expoPushToken: input.token },
        })
      } else {
        await ctx.db.orgMember.create({
          data: {
            orgId: ctx.orgId,
            userId: ctx.userId,
            expoPushToken: input.token,
          },
        })
      }
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
          autoRecordMeetings: z.boolean().optional(),
          ssoEnabled: z.boolean().optional(),
          // domain + metadata are nullable so the UI can clear them explicitly
          ssoDomain: z.string().max(253).nullable().optional(),
          samlMetadataUrl: z.string().url().max(2048).nullable().optional(),
          internalJargon: z.string().max(2000).nullable().optional(),
          companyDescription: z.string().max(2000).nullable().optional(),
          autoDeleteTranscriptsDays: z.number().int().min(1).max(3650).nullable().optional(),
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
          ...(input.autoRecordMeetings !== undefined && {
            autoRecordMeetings: input.autoRecordMeetings,
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
          ...(input.internalJargon !== undefined && {
            internalJargon: input.internalJargon,
          }),
          ...(input.companyDescription !== undefined && {
            companyDescription: input.companyDescription,
          }),
          ...(input.autoDeleteTranscriptsDays !== undefined && {
            autoDeleteTranscriptsDays: input.autoDeleteTranscriptsDays,
          }),
        },
        select: {
          deleteAudioAfterTranscription: true,
          postMeetingEmail: true,
          dailyDigest: true,
          defaultTranscriptionLanguage: true,
          botDisplayName: true,
          autoRecordMeetings: true,
          ssoEnabled: true,
          ssoDomain: true,
          samlMetadataUrl: true,
          internalJargon: true,
          companyDescription: true,
          autoDeleteTranscriptsDays: true,
        },
      })
      return updated
    }),
})
