// Kolasys AI — Public REST API: list note templates available to the org.
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/templates — org templates + global (built-in) templates.
// "Global" is derived from `orgId === null` (no isGlobal column on the
// schema; the tRPC templates router synthesizes the same field).

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const rows = await db.noteTemplate.findMany({
    where: { OR: [{ orgId: auth.orgId }, { orgId: null }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      prompt: true,
      category: true,
      isDefault: true,
      orgId: true,
    },
  })

  const templates = rows.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    prompt: t.prompt,
    category: t.category,
    isGlobal: t.orgId === null,
    isDefault: t.isDefault,
  }))

  return Response.json({ templates })
}
