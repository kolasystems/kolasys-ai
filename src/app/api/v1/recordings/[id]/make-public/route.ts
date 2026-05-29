// Kolasys AI — Public REST API: flip a recording's share link on.
// Auth: `Authorization: Bearer kol_…`
//
// POST /api/v1/recordings/{id}/make-public — mints (or reuses) an 8-char
// URL-safe slug and sets isPublic=true. Idempotent: calling it on an
// already-public recording returns the existing slug. Mirrors
// recordings.makePublic (tRPC) so the public URL is interchangeable.
//
// sharePermissions + shareExpiresAt are left untouched — this endpoint only
// flips the visibility bit. Use the tRPC mutation if you need to set those.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

// Same alphabet recordings.router.ts uses: drops 0/1/i/l/o so the slug is
// unambiguous when typed by a human.
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const SLUG_LEN = 8

function randomSlug(): string {
  let out = ''
  for (let i = 0; i < SLUG_LEN; i++) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]
  }
  return out
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true, publicSlug: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Reuse an existing slug — the same URL must re-activate after a
  // make-private → make-public cycle (slug is retained across make-private).
  let slug = recording.publicSlug
  if (!slug) {
    // 36^8 ≈ 2.8T possibilities → collisions are vanishingly rare, but
    // retry up to 5x to be defensive against the (real) unique constraint.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = randomSlug()
      const taken = await db.recording.findFirst({
        where: { publicSlug: candidate },
        select: { id: true },
      })
      if (!taken) {
        slug = candidate
        break
      }
    }
    if (!slug) {
      return Response.json(
        { error: 'Could not allocate a unique share slug — try again.' },
        { status: 500 },
      )
    }
  }

  await db.recording.update({
    where: { id: recording.id },
    data: { isPublic: true, publicSlug: slug },
  })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kolasys.ai'
  return Response.json({
    publicSlug: slug,
    publicUrl: `${base}/share/${slug}`,
  })
}
