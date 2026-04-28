// Kolasys AI — API key management tRPC router.
//
// Keys are 32-byte cryptographically random tokens, displayed to the user
// exactly once on creation. Storage is SHA-256 hashed — the raw key never
// touches the DB after the create response. Revocation is a soft-delete
// (revokedAt) so audit trails survive.

import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { randomBytes, createHash } from 'node:crypto'
import { router, orgProcedure } from '../trpc'

const KEY_PREFIX = 'kol_'

function generateRawKey(): string {
  return KEY_PREFIX + randomBytes(32).toString('hex')
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export const apiKeysRouter = router({
  // ── List active (non-revoked) keys for the active org ─────────────────────
  // Never returns the keyHash — only metadata + the last-4 preview.
  list: orgProcedure.query(async ({ ctx }) => {
    return ctx.db.apiKey.findMany({
      where: { orgId: ctx.orgId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPreview: true,
        lastUsedAt: true,
        createdAt: true,
      },
    })
  }),

  // ── Create a new key ──────────────────────────────────────────────────────
  // Returns the raw key string ONCE. The UI must surface it immediately —
  // we cannot recover it after this response.
  create: orgProcedure
    .input(z.object({ name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const rawKey = generateRawKey()
      const keyHash = hashApiKey(rawKey)
      const keyPreview = rawKey.slice(-4)

      const created = await ctx.db.apiKey.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          keyHash,
          keyPreview,
        },
        select: {
          id: true,
          name: true,
          keyPreview: true,
          createdAt: true,
        },
      })

      return { ...created, key: rawKey }
    }),

  // ── Revoke a key ──────────────────────────────────────────────────────────
  // Org-scoped: only keys belonging to ctx.orgId can be revoked. Soft-delete
  // by setting revokedAt — authentication checks for `revokedAt: null`.
  revoke: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId, revokedAt: null },
        select: { id: true },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'API key not found or already revoked.',
        })
      }
      await ctx.db.apiKey.update({
        where: { id: input.id },
        data: { revokedAt: new Date() },
      })
      return { ok: true }
    }),
})
