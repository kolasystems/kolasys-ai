// Kolasys AI — Integrations settings tRPC router (Slack, Notion)
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'
import { postToSlack } from '@/services/integrations/slack.service'
import { createNotionPage } from '@/services/integrations/notion.service'

export const integrationsRouter = router({
  // ── Get current integration settings ──────────────────────────────────────
  getSettings: orgProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
      select: {
        slackWebhookUrl: true,
        notionApiKey: true,
        notionDatabaseId: true,
      },
    })
    if (!org) throw new TRPCError({ code: 'NOT_FOUND' })
    return {
      slackWebhookUrl: org.slackWebhookUrl ?? '',
      // Never return the actual Notion API key — just whether it's set
      notionConnected: !!org.notionApiKey,
      notionDatabaseId: org.notionDatabaseId ?? '',
    }
  }),

  // ── Save Slack webhook URL ─────────────────────────────────────────────────
  saveSlack: orgProcedure
    .input(z.object({ webhookUrl: z.string().url().or(z.literal('')) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: { slackWebhookUrl: input.webhookUrl || null },
      })
      return { success: true }
    }),

  // ── Test Slack webhook ─────────────────────────────────────────────────────
  testSlack: orgProcedure
    .input(z.object({ webhookUrl: z.string().url() }))
    .mutation(async ({ ctx }) => {
      const org = await ctx.db.organization.findFirst({
        where: { id: ctx.orgId },
        select: { slackWebhookUrl: true, name: true },
      })
      if (!org?.slackWebhookUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No Slack webhook URL saved.' })
      }
      await postToSlack(org.slackWebhookUrl, {
        recordingTitle: 'Test Notification',
        recordingUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://kolasys.ai',
        summary: `Kolasys AI Slack integration is working for workspace: ${org.name}`,
        sections: [{ title: 'Test', content: 'This is a test notification from Kolasys AI.' }],
        actionItems: [],
      })
      return { success: true }
    }),

  // ── Save Notion credentials ────────────────────────────────────────────────
  saveNotion: orgProcedure
    .input(
      z.object({
        apiKey: z.string().min(1),
        databaseId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.organization.update({
        where: { id: ctx.orgId },
        data: {
          notionApiKey: input.apiKey,
          notionDatabaseId: input.databaseId,
        },
      })
      return { success: true }
    }),

  // ── Disconnect Notion ──────────────────────────────────────────────────────
  disconnectNotion: orgProcedure.mutation(async ({ ctx }) => {
    await ctx.db.organization.update({
      where: { id: ctx.orgId },
      data: { notionApiKey: null, notionDatabaseId: null },
    })
    return { success: true }
  }),

  // ── Test Notion connection ─────────────────────────────────────────────────
  testNotion: orgProcedure.mutation(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
      select: { notionApiKey: true, notionDatabaseId: true, name: true },
    })
    if (!org?.notionApiKey || !org?.notionDatabaseId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Notion is not configured.' })
    }
    await createNotionPage(org.notionApiKey, org.notionDatabaseId, {
      recordingTitle: 'Kolasys AI Test',
      recordingUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://kolasys.ai',
      summary: `Notion integration is working for workspace: ${org.name}`,
      sections: [{ title: 'Test', content: 'This page was created by Kolasys AI.' }],
      actionItems: [],
      createdAt: new Date(),
    })
    return { success: true }
  }),
})
