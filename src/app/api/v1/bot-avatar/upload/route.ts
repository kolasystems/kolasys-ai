// Kolasys AI — Bot avatar upload + render endpoint.
//
// POST /api/v1/bot-avatar/upload   multipart/form-data: { image: File }
//
// Accepts a PNG or JPEG (max 5 MB). Renders a branded 1280×720 JPEG via
// bot-avatar.service, uploads to S3 at bot-avatars/{memberId}-{ts}.jpg,
// stores the S3 key on OrgMember.botAvatarS3Key, and returns { key, url }.
// The `url` is a short-lived signed download URL for immediate preview.

export const runtime = 'nodejs'

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { uploadToS3, getSignedDownloadUrl } from '@/lib/storage'
import { renderBotAvatar } from '@/services/bot-avatar.service'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  if (!auth.userId) {
    return Response.json(
      { error: 'Avatar upload requires a Clerk session token, not a kol_ API key.' },
      { status: 403 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const imageFile = formData.get('image') as File | null
  if (!imageFile) return Response.json({ error: '`image` field is required' }, { status: 400 })
  if (!ACCEPTED.has(imageFile.type)) {
    return Response.json({ error: 'Image must be PNG, JPEG, or WebP' }, { status: 400 })
  }
  if (imageFile.size > MAX_BYTES) {
    return Response.json({ error: 'Image must be under 5 MB' }, { status: 400 })
  }

  // Resolve OrgMember for this user
  const member = await db.orgMember.findFirst({
    where: { orgId: auth.orgId, userId: auth.userId },
    select: { id: true, botDisplayName: true },
  })
  if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })

  const org = await db.organization.findFirst({
    where: { id: auth.orgId },
    select: { botDisplayName: true },
  })

  const displayName = member.botDisplayName ?? org?.botDisplayName ?? 'Kolasys Notetaker'

  // Render the branded camera JPEG
  const logoBuffer = Buffer.from(await imageFile.arrayBuffer())
  let jpegBuffer: Buffer
  try {
    jpegBuffer = await renderBotAvatar(logoBuffer, displayName)
  } catch (err) {
    console.error('[bot-avatar] render failed:', err)
    return Response.json({ error: 'Image processing failed' }, { status: 422 })
  }

  // Upload to S3
  const key = `bot-avatars/${member.id}-${Date.now()}.jpg`
  await uploadToS3(key, jpegBuffer, 'image/jpeg')

  // Persist key on OrgMember
  await db.orgMember.update({
    where: { id: member.id },
    data: { botAvatarS3Key: key },
  })

  const url = await getSignedDownloadUrl(key, 3600)
  return Response.json({ key, url })
}
