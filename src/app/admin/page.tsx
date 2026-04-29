// Kolasys AI — Internal admin dashboard. Hard-gated to paul@kolasystems.com
// because it shows cross-tenant data (every org's stats). Anyone else lands
// on the regular dashboard.

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Kolasys AI' }

const ADMIN_EMAIL = 'paul@kolasystems.com'

function isAdmin(user: Awaited<ReturnType<typeof currentUser>>): boolean {
  if (!user) return false
  return user.emailAddresses.some(
    (e) => e.emailAddress.toLowerCase() === ADMIN_EMAIL,
  )
}

function fmtDuration(secs: number): string {
  if (!secs) return '0s'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s'
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function AdminPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  if (!isAdmin(user)) redirect('/dashboard')

  const orgs = await db.organization.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      createdAt: true,
    },
  })

  // Per-org rollups. HTTP-mode Prisma → no groupBy with aggregations across
  // joined tables, so do it the boring way: parallel scalar queries.
  const rows = await Promise.all(
    orgs.map(async (org) => {
      const [memberCount, recordings] = await Promise.all([
        db.orgMember.count({ where: { orgId: org.id } }),
        db.recording.findMany({
          where: { orgId: org.id },
          select: { duration: true },
        }),
      ])
      const totalDuration = recordings.reduce((s, r) => s + (r.duration ?? 0), 0)
      return {
        ...org,
        memberCount,
        recordingCount: recordings.length,
        totalDuration,
      }
    }),
  )

  const totalOrgs = rows.length
  const totalUsers = rows.reduce((s, r) => s + r.memberCount, 0)
  const totalRecordings = rows.reduce((s, r) => s + r.recordingCount, 0)
  const totalSeconds = rows.reduce((s, r) => s + r.totalDuration, 0)
  const totalMinutes = Math.round(totalSeconds / 60)

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">Admin</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Internal cross-tenant overview · signed in as {ADMIN_EMAIL}
          </p>
        </header>

        {/* Top-level stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Organizations" value={totalOrgs.toLocaleString()} />
          <Stat label="Users" value={totalUsers.toLocaleString()} />
          <Stat label="Recordings" value={totalRecordings.toLocaleString()} />
          <Stat label="Minutes processed" value={totalMinutes.toLocaleString()} />
        </div>

        {/* Org table */}
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-right">Recordings</th>
                <th className="px-4 py-3 text-right">Total Duration</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                    No organizations yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{r.name}</div>
                    <div className="font-mono text-xs text-neutral-400">{r.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {r.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {r.memberCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {r.recordingCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {fmtDuration(r.totalDuration)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
    </div>
  )
}
