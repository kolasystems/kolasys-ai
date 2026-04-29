// Kolasys AI — Admin-only org data export.
//
// GET /api/admin/export/{orgId} — returns a JSON dump of every recording,
// transcript, and note tree for the given org. Auth: Clerk session +
// presence in the AdminUser table (matches the /admin page gate).

import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

async function isAdmin(): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) return false

  const user = await currentUser()
  if (!user) return false

  for (const e of user.emailAddresses) {
    const match = await db.adminUser.findFirst({
      where: { email: e.emailAddress.toLowerCase() },
      select: { id: true },
    })
    // Any admin role can export — read-only.
    if (match) return true
  }
  return false
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  if (!(await isAdmin())) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { orgId } = await params

  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      createdAt: true,
      trialStartedAt: true,
      trialEndsAt: true,
      notes: true,
      maxRecordingsPerMonth: true,
    },
  })
  if (!org) return Response.json({ error: 'Not found' }, { status: 404 })

  const [members, recordings] = await Promise.all([
    db.orgMember.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, role: true, createdAt: true },
    }),
    db.recording.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        source: true,
        status: true,
        duration: true,
        fileSize: true,
        createdAt: true,
        startedAt: true,
        endedAt: true,
        transcript: {
          select: {
            id: true,
            language: true,
            text: true,
            confidence: true,
            createdAt: true,
            segments: {
              orderBy: { startTime: 'asc' },
              select: {
                startTime: true,
                endTime: true,
                speaker: true,
                text: true,
                confidence: true,
              },
            },
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            summary: true,
            createdAt: true,
            sections: {
              orderBy: { order: 'asc' },
              select: { title: true, content: true, order: true },
            },
            actionItems: {
              orderBy: { createdAt: 'asc' },
              select: {
                title: true,
                description: true,
                assignee: true,
                dueDate: true,
                status: true,
                priority: true,
              },
            },
          },
        },
      },
    }),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    org,
    members,
    recordings,
  }

  const filename = `${org.slug}-${org.id}.kolasys-export.json`
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
