// Kolasys AI — Internal admin dashboard. Hard-gated to paul@kolasystems.com
// because it shows cross-tenant data (every org's stats). Anyone else lands
// on the regular dashboard.

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { RefreshCcw, AlertTriangle } from 'lucide-react'
import { db } from '@/lib/db'
import { summarizationQueue, transcriptionQueue } from '@/lib/queues'
import { Plan } from '@/generated/prisma/client'
import { KolasysLogoMark } from '@/components/kolasys-logo'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Kolasys AI' }

const ADMIN_EMAIL = 'paul@kolasystems.com'

// Plan rotation. Schema has FREE/PRO/ENTERPRISE only — no TEAM — so the
// "FREE → PRO → TEAM → FREE" cycle in the spec maps to the real enum here.
const PLAN_CYCLE: Record<Plan, Plan> = {
  [Plan.FREE]: Plan.PRO,
  [Plan.PRO]: Plan.ENTERPRISE,
  [Plan.ENTERPRISE]: Plan.FREE,
}

// ── Server action: cycle an org's plan ─────────────────────────────────────
async function cyclePlanAction(formData: FormData) {
  'use server'
  const orgId = String(formData.get('orgId') ?? '')
  if (!orgId) return

  // Re-check admin gate inside the action — never trust the form.
  const user = await currentUser()
  if (!isAdmin(user)) return

  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: { plan: true },
  })
  if (!org) return

  await db.organization.update({
    where: { id: orgId },
    data: { plan: PLAN_CYCLE[org.plan] },
  })
  revalidatePath('/admin')
}

function isAdmin(user: Awaited<ReturnType<typeof currentUser>>): boolean {
  if (!user) return false
  return user.emailAddresses.some(
    (e) => e.emailAddress.toLowerCase() === ADMIN_EMAIL,
  )
}

// ── Formatters ─────────────────────────────────────────────────────────────
function fmtDuration(secs: number): string {
  if (!secs) return '0s'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 10)
}

function relativeTime(d: Date | null): string {
  if (!d) return 'never'
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(d)
}

// ── Queue health classification ────────────────────────────────────────────
type QueueCounts = {
  waiting: number
  active: number
  failed: number
  completed: number
  delayed: number
  paused: number
}

type Health = 'healthy' | 'degraded' | 'down'
function classifyHealth(c: QueueCounts): Health {
  if (c.failed > 10) return 'down'
  if (c.waiting > 5) return 'degraded'
  return 'healthy'
}

const HEALTH_STYLE: Record<Health, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'bg-green-100 text-green-800 border-green-200' },
  degraded: { label: 'Degraded', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  down: { label: 'Down', cls: 'bg-red-100 text-red-800 border-red-200' },
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function AdminPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  if (!isAdmin(user)) redirect('/dashboard')

  const now = new Date()
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // ── Cross-tenant queries (parallel) ──────────────────────────────────────
  const [
    orgs,
    allRecordings,
    failedRecordingCount,
    recentRecordings,
    sumCounts,
    trCounts,
  ] = await Promise.all([
    db.organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, plan: true, createdAt: true },
    }),
    db.recording.findMany({
      select: { orgId: true, duration: true, createdAt: true, status: true },
    }),
    db.recording.count({ where: { status: 'FAILED' } }),
    db.recording.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        duration: true,
        createdAt: true,
        org: { select: { name: true } },
      },
    }),
    summarizationQueue.getJobCounts(
      'waiting', 'active', 'delayed', 'failed', 'completed', 'paused',
    ) as Promise<QueueCounts>,
    transcriptionQueue.getJobCounts(
      'waiting', 'active', 'delayed', 'failed', 'completed', 'paused',
    ) as Promise<QueueCounts>,
  ])

  // ── Per-org rollups ──────────────────────────────────────────────────────
  const memberCounts = await Promise.all(
    orgs.map((o) => db.orgMember.count({ where: { orgId: o.id } })),
  )

  const rows = orgs.map((org, i) => {
    const orgRecs = allRecordings.filter((r) => r.orgId === org.id)
    const totalDuration = orgRecs.reduce((s, r) => s + (r.duration ?? 0), 0)
    const lastActive = orgRecs.reduce<Date | null>((acc, r) => {
      if (!acc || r.createdAt > acc) return r.createdAt
      return acc
    }, null)
    const recentRec = orgRecs.some((r) => r.createdAt >= week)
    const status: 'active' | 'new' | 'inactive' =
      recentRec
        ? 'active'
        : orgRecs.length === 0 && org.createdAt >= week
          ? 'new'
          : 'inactive'

    return {
      ...org,
      memberCount: memberCounts[i],
      recordingCount: orgRecs.length,
      totalDuration,
      lastActive,
      status,
    }
  })

  // ── Top stats ────────────────────────────────────────────────────────────
  const totalOrgs = rows.length
  const totalUsers = memberCounts.reduce((s, n) => s + n, 0)
  const totalRecordings = allRecordings.length
  const totalSeconds = allRecordings.reduce((s, r) => s + (r.duration ?? 0), 0)
  const totalMinutes = Math.round(totalSeconds / 60)

  const orgsWithRecsLast24h = new Set(
    allRecordings.filter((r) => r.createdAt >= day).map((r) => r.orgId),
  ).size
  const recordingsThisWeek = allRecordings.filter((r) => r.createdAt >= week).length
  const avgRecordingSeconds =
    totalRecordings > 0 ? Math.round(totalSeconds / totalRecordings) : 0

  // ── System banner ────────────────────────────────────────────────────────
  const stuckJobs = sumCounts.waiting + trCounts.waiting
  const showBanner = failedRecordingCount > 0 || stuckJobs > 5

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* System banner */}
      {showBanner && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-8 py-2.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-800">
              <strong>{failedRecordingCount}</strong> recordings failed ·{' '}
              <strong>{stuckJobs}</strong> jobs stuck in queue
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl p-8">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <KolasysLogoMark size={36} className="text-neutral-900" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                <span style={{ color: '#CA2625' }}>Kolasys AI</span> Admin
              </h1>
              <p className="mt-0.5 text-sm text-neutral-500">
                Internal cross-tenant overview · signed in as {ADMIN_EMAIL}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link
              href="/admin"
              prefetch={false}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </Link>
            <p className="text-xs text-neutral-500">
              Last updated {now.toLocaleString()}
            </p>
          </div>
        </header>

        {/* Top-level stats — 8 cards, 4-col on desktop, 2-col on mobile */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Organizations" value={totalOrgs.toLocaleString()} />
          <Stat label="Users" value={totalUsers.toLocaleString()} />
          <Stat label="Recordings" value={totalRecordings.toLocaleString()} />
          <Stat label="Minutes processed" value={totalMinutes.toLocaleString()} />
          <Stat label="Active today" value={orgsWithRecsLast24h.toLocaleString()} />
          <Stat label="This week" value={recordingsThisWeek.toLocaleString()} />
          <Stat
            label="Failed"
            value={failedRecordingCount.toLocaleString()}
            tone={failedRecordingCount > 0 ? 'warn' : 'default'}
          />
          <Stat
            label="Avg length"
            value={fmtDuration(avgRecordingSeconds)}
          />
        </div>

        {/* Worker health */}
        <section className="mb-8 rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Worker health</h2>
          </div>
          <div className="grid grid-cols-1 gap-px bg-neutral-100 sm:grid-cols-2">
            <QueueCard name="Transcription" counts={trCounts} />
            <QueueCard name="Summarization" counts={sumCounts} />
          </div>
        </section>

        {/* Orgs table */}
        <section className="mb-8 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              Organizations ({rows.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-right">Recordings</th>
                <th className="px-4 py-3 text-right">Duration</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-500">
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
                    <OrgStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <form action={cyclePlanAction}>
                      <input type="hidden" name="orgId" value={r.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-200"
                        title="Click to cycle plan: FREE → PRO → ENTERPRISE → FREE"
                      >
                        {r.plan}
                      </button>
                    </form>
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
                  <td className="px-4 py-3 text-neutral-500" title={r.lastActive?.toISOString() ?? ''}>
                    {relativeTime(r.lastActive)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Recent recordings */}
        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              Recent recordings (last 10)
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-4 py-3">Org</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3 text-right">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {recentRecordings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    No recordings yet.
                  </td>
                </tr>
              )}
              {recentRecordings.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-700">{r.org.name}</td>
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-neutral-900">
                    {r.title}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {fmtDuration(r.duration ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <RecordingStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500" title={r.createdAt.toISOString()}>
                    {relativeTime(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

// ── Sub-components (server-only — plain rendering) ─────────────────────────

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warn'
}) {
  return (
    <div
      className={
        tone === 'warn'
          ? 'rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm'
          : 'rounded-lg border border-neutral-200 bg-white p-4 shadow-sm'
      }
    >
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p
        className={
          tone === 'warn'
            ? 'mt-1 text-2xl font-bold tabular-nums text-red-700'
            : 'mt-1 text-2xl font-bold tabular-nums text-neutral-900'
        }
      >
        {value}
      </p>
    </div>
  )
}

function OrgStatusBadge({ status }: { status: 'active' | 'new' | 'inactive' }) {
  const map = {
    active: 'bg-green-100 text-green-800',
    new: 'bg-blue-100 text-blue-800',
    inactive: 'bg-neutral-100 text-neutral-600',
  }
  const label = status[0].toUpperCase() + status.slice(1)
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {label}
    </span>
  )
}

function RecordingStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    READY: 'bg-green-100 text-green-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    TRANSCRIBING: 'bg-blue-100 text-blue-800',
    SUMMARIZING: 'bg-blue-100 text-blue-800',
    FAILED: 'bg-red-100 text-red-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
  }
  const cls = map[status] ?? 'bg-neutral-100 text-neutral-700'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  )
}

function QueueCard({ name, counts }: { name: string; counts: QueueCounts }) {
  const health = classifyHealth(counts)
  const style = HEALTH_STYLE[health]
  return (
    <div className="bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{name} queue</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${style.cls}`}
        >
          {style.label}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <QueueStat label="Waiting" value={counts.waiting} highlight={counts.waiting > 5} />
        <QueueStat label="Active" value={counts.active} />
        <QueueStat label="Failed" value={counts.failed} highlight={counts.failed > 10} warn />
        <QueueStat label="Completed" value={counts.completed} />
      </div>
    </div>
  )
}

function QueueStat({
  label,
  value,
  highlight = false,
  warn = false,
}: {
  label: string
  value: number
  highlight?: boolean
  warn?: boolean
}) {
  const valueCls = highlight
    ? warn
      ? 'text-red-700'
      : 'text-yellow-700'
    : 'text-neutral-900'
  return (
    <div className="rounded-md bg-neutral-50 p-2 text-center">
      <p className={`text-lg font-bold tabular-nums ${valueCls}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
    </div>
  )
}
