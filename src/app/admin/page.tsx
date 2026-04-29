// Kolasys AI — Internal admin dashboard.
// Access controlled by the `AdminUser` table (seeded with paul@kolasystems.com
// as SUPER_ADMIN on first hit when empty). Server component throughout —
// the only client surface is the placeholder Transfer Ownership button.

import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import {
  RefreshCcw,
  AlertTriangle,
  ChevronDown,
  Trash2,
  UserPlus,
  Download,
  Mail,
  CheckCircle2,
} from 'lucide-react'
import { db } from '@/lib/db'
import { summarizationQueue, transcriptionQueue } from '@/lib/queues'
import { Plan, AdminRole } from '@/generated/prisma/client'
import { KolasysLogoMark } from '@/components/kolasys-logo'
import { TransferOwnershipButton } from '@/components/admin-transfer-ownership-button'
import { resend, FROM_EMAIL } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Kolasys AI' }

const BOOTSTRAP_EMAIL = 'paul@kolasystems.com'

// Plan rotation. Schema enum: FREE / PRO / ENTERPRISE only — no TEAM.
const PLAN_CYCLE: Record<Plan, Plan> = {
  [Plan.FREE]: Plan.PRO,
  [Plan.PRO]: Plan.ENTERPRISE,
  [Plan.ENTERPRISE]: Plan.FREE,
}

// ── Auth resolution ────────────────────────────────────────────────────────
type AdminCtx = { email: string; role: AdminRole; id: string } | null

/**
 * Look up the current Clerk user in AdminUser. On first ever call (table
 * empty) seed paul@kolasystems.com as SUPER_ADMIN so the portal has at
 * least one super admin.
 */
async function resolveAdmin(): Promise<AdminCtx> {
  const user = await currentUser()
  if (!user) return null

  const total = await db.adminUser.count()
  if (total === 0) {
    try {
      await db.adminUser.create({
        data: { email: BOOTSTRAP_EMAIL, role: AdminRole.SUPER_ADMIN, addedBy: 'system' },
      })
    } catch {
      // race — another request seeded first; fine.
    }
  }

  for (const e of user.emailAddresses) {
    const match = await db.adminUser.findFirst({
      where: { email: e.emailAddress.toLowerCase() },
      select: { id: true, email: true, role: true },
    })
    if (match) return match
  }
  return null
}

function requireRole(ctx: AdminCtx, allowed: AdminRole[]): boolean {
  if (!ctx) return false
  return allowed.includes(ctx.role)
}

/**
 * Append-only audit row writer. Failures are logged but never block the
 * caller — the user-facing mutation has already succeeded by the time we
 * record it, so a flaky audit insert shouldn't surface as an action error.
 */
async function audit(
  ctx: AdminCtx,
  action: string,
  fields: { targetOrgId?: string; targetEmail?: string; details?: string } = {},
): Promise<void> {
  if (!ctx) return
  try {
    await db.adminAuditLog.create({
      data: {
        adminEmail: ctx.email,
        action,
        targetOrgId: fields.targetOrgId ?? null,
        targetEmail: fields.targetEmail ?? null,
        details: fields.details ?? null,
      },
    })
  } catch (err) {
    console.error('[admin/audit] failed to write audit row:', err)
  }
}

// ── Server actions ─────────────────────────────────────────────────────────

async function cyclePlanAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  if (!orgId) return
  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: { plan: true },
  })
  if (!org) return
  const next = PLAN_CYCLE[org.plan]
  await db.organization.update({
    where: { id: orgId },
    data: { plan: next },
  })
  await audit(ctx, 'cyclePlan', {
    targetOrgId: orgId,
    details: `${org.plan} → ${next}`,
  })
  revalidatePath('/admin')
}

async function addAdminAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN])) return

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const roleRaw = String(formData.get('role') ?? '').toUpperCase()
  if (!email || !email.includes('@')) return
  const role: AdminRole =
    roleRaw === 'ADMIN' || roleRaw === 'SUPPORT' || roleRaw === 'SUPER_ADMIN'
      ? (roleRaw as AdminRole)
      : AdminRole.ADMIN

  const existing = await db.adminUser.findFirst({ where: { email }, select: { id: true, role: true } })
  if (existing) {
    await db.adminUser.update({ where: { id: existing.id }, data: { role } })
    await audit(ctx, 'updateAdminRole', {
      targetEmail: email,
      details: `${existing.role} → ${role}`,
    })
  } else {
    await db.adminUser.create({
      data: { email, role, addedBy: ctx!.email },
    })
    await audit(ctx, 'addAdmin', {
      targetEmail: email,
      details: `role=${role}`,
    })
  }
  revalidatePath('/admin')
}

async function removeAdminAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN])) return

  const id = String(formData.get('id') ?? '')
  if (!id) return
  // Never remove yourself.
  if (id === ctx!.id) return

  // Refuse to delete the last SUPER_ADMIN.
  const target = await db.adminUser.findFirst({ where: { id }, select: { email: true, role: true } })
  if (!target) return
  if (target.role === AdminRole.SUPER_ADMIN) {
    const superCount = await db.adminUser.count({ where: { role: AdminRole.SUPER_ADMIN } })
    if (superCount <= 1) return
  }

  await db.adminUser.delete({ where: { id } })
  await audit(ctx, 'removeAdmin', {
    targetEmail: target.email,
    details: `role=${target.role}`,
  })
  revalidatePath('/admin')
}

async function setTrialAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  const days = Number(formData.get('days') ?? 14)
  if (!orgId || !Number.isFinite(days) || days <= 0) return

  const now = new Date()
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  await db.organization.update({
    where: { id: orgId },
    data: { trialStartedAt: now, trialEndsAt: end },
  })
  await audit(ctx, 'setTrial', {
    targetOrgId: orgId,
    details: `${days}d, ends ${end.toISOString().slice(0, 10)}`,
  })
  revalidatePath('/admin')
}

async function extendTrialAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  const days = Number(formData.get('days') ?? 7)
  if (!orgId || !Number.isFinite(days) || days <= 0) return

  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: { trialEndsAt: true, trialStartedAt: true },
  })
  if (!org) return

  const now = new Date()
  // If no trial yet (or expired), base extension off "now"; otherwise extend.
  const base =
    org.trialEndsAt && org.trialEndsAt > now ? org.trialEndsAt : now
  const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  await db.organization.update({
    where: { id: orgId },
    data: {
      trialEndsAt: newEnd,
      trialStartedAt: org.trialStartedAt ?? now,
    },
  })
  await audit(ctx, 'extendTrial', {
    targetOrgId: orgId,
    details: `+${days}d, new end ${newEnd.toISOString().slice(0, 10)}`,
  })
  revalidatePath('/admin')
}

async function expireTrialAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  if (!orgId) return
  await db.organization.update({
    where: { id: orgId },
    data: { trialEndsAt: new Date() },
  })
  await audit(ctx, 'expireTrial', { targetOrgId: orgId })
  revalidatePath('/admin')
}

async function addOrgNoteAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  const notes = String(formData.get('notes') ?? '').slice(0, 4000)
  if (!orgId) return
  await db.organization.update({
    where: { id: orgId },
    data: { notes: notes || null },
  })
  await audit(ctx, 'addOrgNote', {
    targetOrgId: orgId,
    details: `len=${notes.length}`,
  })
  revalidatePath('/admin')
}

async function setUsageLimitAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  const raw = Number(formData.get('maxRecordingsPerMonth') ?? 0)
  if (!orgId || !Number.isFinite(raw) || raw < 0) return

  const limit = Math.min(Math.floor(raw), 1_000_000)
  const before = await db.organization.findFirst({
    where: { id: orgId },
    select: { maxRecordingsPerMonth: true },
  })
  await db.organization.update({
    where: { id: orgId },
    data: { maxRecordingsPerMonth: limit },
  })
  await audit(ctx, 'setUsageLimit', {
    targetOrgId: orgId,
    details: `${before?.maxRecordingsPerMonth ?? 0} → ${limit}`,
  })
  revalidatePath('/admin')
}

async function sendOrgEmailAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) {
    redirect('/admin')
  }

  const orgId = String(formData.get('orgId') ?? '')
  const message = String(formData.get('message') ?? '').trim().slice(0, 4000)
  if (!orgId || !message) {
    redirect(`/admin?emailErr=${encodeURIComponent(orgId)}&reason=missing`)
  }

  const org = await db.organization.findFirst({
    where: { id: orgId },
    select: { name: true },
  })
  if (!org) {
    redirect(`/admin?emailErr=${encodeURIComponent(orgId)}&reason=notfound`)
  }

  const members = await db.orgMember.findMany({
    where: { orgId },
    select: { userId: true },
  })

  // Resolve emails via Clerk. Skip members with no usable email rather than
  // failing the whole batch.
  const client = await clerkClient()
  const recipients: string[] = []
  for (const m of members) {
    try {
      const u = await client.users.getUser(m.userId)
      const primary =
        u.primaryEmailAddressId
          ? u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
          : u.emailAddresses[0]?.emailAddress
      if (primary) recipients.push(primary)
    } catch (err) {
      console.error(`[admin/email] Failed to resolve user ${m.userId}:`, err)
    }
  }

  if (recipients.length === 0) {
    redirect(`/admin?emailErr=${encodeURIComponent(orgId)}&reason=norecipients`)
  }

  let sent = 0
  let failed = 0
  for (const to of recipients) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: 'Message from Kolasys AI',
        text: `${message}\n\n— Kolasys AI Team\n(sent by ${ctx!.email})`,
      })
      if (error) {
        console.error(`[admin/email] Resend error for ${to}:`, error)
        failed++
      } else {
        sent++
      }
    } catch (err) {
      console.error(`[admin/email] Send threw for ${to}:`, err)
      failed++
    }
  }

  await audit(ctx, 'sendOrgEmail', {
    targetOrgId: orgId,
    details: `recipients=${recipients.length}, sent=${sent}, failed=${failed}, msgLen=${message.length}`,
  })

  redirect(
    `/admin?msgSent=${encodeURIComponent(orgId)}&sent=${sent}&failed=${failed}`,
  )
}

async function setStripeIdAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  if (!orgId) return
  // Empty string clears the field. Trim whitespace; clamp to a sane length.
  const customer = String(formData.get('stripeCustomerId') ?? '').trim().slice(0, 100)
  const subscription = String(formData.get('stripeSubscriptionId') ?? '').trim().slice(0, 100)

  await db.organization.update({
    where: { id: orgId },
    data: {
      stripeCustomerId: customer || null,
      stripeSubscriptionId: subscription || null,
    },
  })
  await audit(ctx, 'setStripeId', {
    targetOrgId: orgId,
    details: `customer=${customer || '∅'}, subscription=${subscription || '∅'}`,
  })
  revalidatePath('/admin')
}

async function suspendOrgAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  if (!orgId) return
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500)

  await db.organization.update({
    where: { id: orgId },
    data: { suspended: true, suspendedReason: reason || null },
  })
  await audit(ctx, 'suspendOrg', {
    targetOrgId: orgId,
    details: reason || '(no reason given)',
  })
  revalidatePath('/admin')
}

async function unsuspendOrgAction(formData: FormData) {
  'use server'
  const ctx = await resolveAdmin()
  if (!requireRole(ctx, [AdminRole.SUPER_ADMIN, AdminRole.ADMIN])) return

  const orgId = String(formData.get('orgId') ?? '')
  if (!orgId) return
  await db.organization.update({
    where: { id: orgId },
    data: { suspended: false, suspendedReason: null },
  })
  await audit(ctx, 'unsuspendOrg', { targetOrgId: orgId })
  revalidatePath('/admin')
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

// ── Trial classification ───────────────────────────────────────────────────
type TrialStatus =
  | { kind: 'none' }
  | { kind: 'active'; daysLeft: number }
  | { kind: 'expired' }

function classifyTrial(end: Date | null): TrialStatus {
  if (!end) return { kind: 'none' }
  const ms = end.getTime() - Date.now()
  if (ms <= 0) return { kind: 'expired' }
  return { kind: 'active', daysLeft: Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000))) }
}

// ── Queue health ───────────────────────────────────────────────────────────
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
type AdminPageProps = {
  searchParams: Promise<{
    msgSent?: string
    sent?: string
    failed?: string
    emailErr?: string
    reason?: string
  }>
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const ctx = await resolveAdmin()
  if (!ctx) redirect('/dashboard')

  const isSuper = ctx.role === AdminRole.SUPER_ADMIN
  const canMutate = ctx.role === AdminRole.SUPER_ADMIN || ctx.role === AdminRole.ADMIN

  const sp = await searchParams

  const now = new Date()
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    orgs,
    allRecordings,
    failedRecordingCount,
    recentRecordings,
    sumCounts,
    trCounts,
    admins,
  ] = await Promise.all([
    db.organization.findMany({
      orderBy: { createdAt: 'desc' },
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
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        suspended: true,
        suspendedReason: true,
      },
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
    db.adminUser.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, email: true, role: true, addedBy: true, createdAt: true },
    }),
  ])

  const auditLog = await db.adminAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      adminEmail: true,
      action: true,
      targetOrgId: true,
      targetEmail: true,
      details: true,
      createdAt: true,
    },
  })
  const orgNameById = Object.fromEntries(orgs.map((o) => [o.id, o.name]))

  // Per-org rollups + members
  const [memberCounts, allMembers] = await Promise.all([
    Promise.all(orgs.map((o) => db.orgMember.count({ where: { orgId: o.id } }))),
    db.orgMember.findMany({
      where: { orgId: { in: orgs.map((o) => o.id) } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, orgId: true, userId: true, role: true, createdAt: true },
    }),
  ])

  const rows = orgs.map((org, i) => {
    const orgRecs = allRecordings.filter((r) => r.orgId === org.id)
    const totalDuration = orgRecs.reduce((s, r) => s + (r.duration ?? 0), 0)
    const lastActive = orgRecs.reduce<Date | null>((acc, r) => {
      if (!acc || r.createdAt > acc) return r.createdAt
      return acc
    }, null)
    const recentRec = orgRecs.some((r) => r.createdAt >= week)
    const status: 'active' | 'new' | 'inactive' = recentRec
      ? 'active'
      : orgRecs.length === 0 && org.createdAt >= week
        ? 'new'
        : 'inactive'

    const recordingsThisMonth = orgRecs.filter(
      (r) => r.createdAt >= monthStart,
    ).length

    return {
      ...org,
      memberCount: memberCounts[i],
      recordingCount: orgRecs.length,
      recordingsThisMonth,
      totalDuration,
      lastActive,
      status,
      members: allMembers.filter((m) => m.orgId === org.id),
      trial: classifyTrial(org.trialEndsAt),
    }
  })

  // Top stats
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

  const stuckJobs = sumCounts.waiting + trCounts.waiting
  const showBanner = failedRecordingCount > 0 || stuckJobs > 5

  return (
    <div className="min-h-screen bg-neutral-50">
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
                Signed in as {ctx.email}{' '}
                <RoleBadge role={ctx.role} />
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

        {/* Admin Users panel */}
        <section className="mb-8 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              Admin users ({admins.length})
            </h2>
            {!isSuper && (
              <span className="text-xs text-neutral-500">
                Only SUPER_ADMINs can manage admins
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Added by</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">{a.email}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={a.role} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{a.addedBy ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-500">{fmtDate(a.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {isSuper && a.id !== ctx.id ? (
                      <form action={removeAdminAction} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-neutral-400">
                        {a.id === ctx.id ? 'You' : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isSuper && (
            <form
              action={addAdminAction}
              className="flex flex-wrap items-end gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3"
            >
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="new-admin@example.com"
                  className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Role
                </label>
                <select
                  name="role"
                  defaultValue="ADMIN"
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPPORT">SUPPORT</option>
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#CA2625] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#b21f1f]"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add admin
              </button>
            </form>
          )}
        </section>

        {/* Top-level stats — 8 cards */}
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
          <Stat label="Avg length" value={fmtDuration(avgRecordingSeconds)} />
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

        {/* Org cards */}
        <section className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            Organizations ({rows.length})
          </h2>

          {rows.length === 0 && (
            <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 shadow-sm">
              No organizations yet.
            </p>
          )}

          {rows.map((r) => (
            <article
              key={r.id}
              className={
                'overflow-hidden rounded-lg border bg-white shadow-sm ' +
                (r.suspended
                  ? 'border-red-300 ring-1 ring-red-200'
                  : 'border-neutral-200')
              }
            >
              {/* Card header — name + badges */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900">{r.name}</h3>
                    {r.suspended && (
                      <span
                        className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white"
                        title={r.suspendedReason ?? 'no reason given'}
                      >
                        Suspended
                      </span>
                    )}
                    <OrgStatusBadge status={r.status} />
                    <TrialBadge trial={r.trial} />
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{r.slug}</p>
                  {r.suspended && r.suspendedReason && (
                    <p className="mt-1 text-xs text-red-700">
                      Reason: {r.suspendedReason}
                    </p>
                  )}
                </div>
                {canMutate && (
                  <form action={cyclePlanAction}>
                    <input type="hidden" name="orgId" value={r.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
                      title="Click to cycle plan: FREE → PRO → ENTERPRISE → FREE"
                    >
                      {r.plan}
                    </button>
                  </form>
                )}
              </div>

              {/* Stats grid */}
              <dl className="grid grid-cols-2 gap-px bg-neutral-100 sm:grid-cols-5">
                <Cell label="Members" value={String(r.memberCount)} />
                <Cell label="Recordings" value={String(r.recordingCount)} />
                <Cell label="Duration" value={fmtDuration(r.totalDuration)} />
                <Cell label="Last active" value={relativeTime(r.lastActive)} />
                <Cell label="Created" value={fmtDate(r.createdAt)} />
              </dl>

              {/* Trial controls */}
              {canMutate && (
                <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 px-4 py-2.5">
                  <span className="text-xs font-medium text-neutral-500">Trial:</span>
                  <form action={setTrialAction}>
                    <input type="hidden" name="orgId" value={r.id} />
                    <input type="hidden" name="days" value="14" />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Set 14d
                    </button>
                  </form>
                  <form action={extendTrialAction}>
                    <input type="hidden" name="orgId" value={r.id} />
                    <input type="hidden" name="days" value="7" />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Extend +7
                    </button>
                  </form>
                  <form action={expireTrialAction}>
                    <input type="hidden" name="orgId" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Expire
                    </button>
                  </form>
                  {r.trialEndsAt && (
                    <span
                      className="text-xs text-neutral-500"
                      title={r.trialEndsAt.toISOString()}
                    >
                      ends {fmtDate(r.trialEndsAt)}
                    </span>
                  )}
                </div>
              )}

              {/* Notes — inline editable */}
              <details className="border-t border-neutral-100">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                  <ChevronDown className="h-3 w-3" />
                  Notes{' '}
                  {r.notes ? (
                    <span className="ml-1 truncate text-neutral-500">
                      — {r.notes.slice(0, 80)}
                      {r.notes.length > 80 && '…'}
                    </span>
                  ) : (
                    <span className="ml-1 text-neutral-400">— none</span>
                  )}
                </summary>
                {canMutate ? (
                  <form
                    action={addOrgNoteAction}
                    className="space-y-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3"
                  >
                    <input type="hidden" name="orgId" value={r.id} />
                    <textarea
                      name="notes"
                      defaultValue={r.notes ?? ''}
                      rows={3}
                      placeholder="Internal notes about this org…"
                      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-[#CA2625] px-3 py-1 text-xs font-semibold text-white hover:bg-[#b21f1f]"
                    >
                      Save notes
                    </button>
                  </form>
                ) : (
                  <p className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
                    {r.notes || 'No notes — read-only role.'}
                  </p>
                )}
              </details>

              {/* Limits */}
              <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-4 py-2.5">
                <span className="text-xs font-medium text-neutral-500">Limits:</span>
                <UsageMeter
                  used={r.recordingsThisMonth}
                  cap={r.maxRecordingsPerMonth}
                />
                {canMutate && (
                  <form
                    action={setUsageLimitAction}
                    className="ml-auto flex items-center gap-2"
                  >
                    <input type="hidden" name="orgId" value={r.id} />
                    <label className="text-xs text-neutral-500">
                      Max recordings/month
                    </label>
                    <input
                      type="number"
                      name="maxRecordingsPerMonth"
                      min={0}
                      defaultValue={r.maxRecordingsPerMonth}
                      className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs tabular-nums focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-neutral-700"
                    >
                      Save
                    </button>
                  </form>
                )}
              </div>

              {/* Billing — Stripe IDs */}
              <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-4 py-2.5">
                <span className="text-xs font-medium text-neutral-500">Billing:</span>
                <span className="text-xs text-neutral-700">
                  Customer:{' '}
                  <code className="font-mono">
                    {r.stripeCustomerId ?? 'No customer'}
                  </code>
                </span>
                <span className="text-xs text-neutral-700">
                  Subscription:{' '}
                  <code className="font-mono">
                    {r.stripeSubscriptionId ?? 'No subscription'}
                  </code>
                </span>
                {canMutate && (
                  <form
                    action={setStripeIdAction}
                    className="ml-auto flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="orgId" value={r.id} />
                    <input
                      type="text"
                      name="stripeCustomerId"
                      defaultValue={r.stripeCustomerId ?? ''}
                      placeholder="cus_…"
                      className="w-32 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-xs focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20"
                    />
                    <input
                      type="text"
                      name="stripeSubscriptionId"
                      defaultValue={r.stripeSubscriptionId ?? ''}
                      placeholder="sub_…"
                      className="w-32 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-xs focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-neutral-700"
                    >
                      Save Stripe IDs
                    </button>
                  </form>
                )}
              </div>

              {/* Suspend / Unsuspend */}
              {canMutate && (
                <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 px-4 py-2.5">
                  <span className="text-xs font-medium text-neutral-500">
                    Suspension:
                  </span>
                  {r.suspended ? (
                    <form action={unsuspendOrgAction}>
                      <input type="hidden" name="orgId" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
                      >
                        Unsuspend
                      </button>
                    </form>
                  ) : (
                    <form
                      action={suspendOrgAction}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="orgId" value={r.id} />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Reason (optional)"
                        className="w-56 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Suspend
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Send message + Export */}
              <details className="border-t border-neutral-100">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                  <ChevronDown className="h-3 w-3" />
                  <Mail className="h-3 w-3" />
                  Send message to members
                </summary>
                <div className="space-y-2 border-t border-neutral-100 bg-neutral-50 px-4 py-3">
                  {/* Result banner from the last sendOrgEmailAction redirect */}
                  {sp.msgSent === r.id && (
                    <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Sent to {sp.sent ?? '0'} member(s).
                      {Number(sp.failed ?? '0') > 0 && (
                        <span className="text-amber-700">
                          {' '}({sp.failed} failed)
                        </span>
                      )}
                    </div>
                  )}
                  {sp.emailErr === r.id && (
                    <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Couldn&apos;t send: {sp.reason ?? 'unknown'}
                    </div>
                  )}
                  {canMutate ? (
                    <form action={sendOrgEmailAction} className="space-y-2">
                      <input type="hidden" name="orgId" value={r.id} />
                      <textarea
                        name="message"
                        required
                        rows={4}
                        placeholder={`Subject is fixed: "Message from Kolasys AI". Body goes here…`}
                        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[#CA2625] focus:outline-none focus:ring-2 focus:ring-[#CA2625]/20"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          className="rounded-md bg-[#CA2625] px-3 py-1 text-xs font-semibold text-white hover:bg-[#b21f1f]"
                        >
                          Send to {r.memberCount} member
                          {r.memberCount === 1 ? '' : 's'}
                        </button>
                        <span className="text-xs text-neutral-500">
                          Emails resolved via Clerk; missing emails are skipped.
                        </span>
                      </div>
                    </form>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      Read-only role — only ADMIN/SUPER_ADMIN can send.
                    </p>
                  )}
                </div>
              </details>

              {/* Export data */}
              <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2.5">
                <span className="text-xs font-medium text-neutral-500">
                  Data export
                </span>
                <a
                  href={`/api/admin/export/${r.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
                  download
                >
                  <Download className="h-3 w-3" />
                  Export data (JSON)
                </a>
              </div>

              {/* Members */}
              <details className="border-t border-neutral-100">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                  <ChevronDown className="h-3 w-3" />
                  Members ({r.memberCount})
                </summary>
                <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3">
                  {r.members.length === 0 ? (
                    <p className="text-xs text-neutral-500">No members.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {r.members.map((m) => (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center gap-2 text-xs text-neutral-700"
                        >
                          <span className="font-mono">{m.userId}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600 ring-1 ring-neutral-200">
                            {m.role}
                          </span>
                          <span className="text-neutral-400">
                            joined {fmtDate(m.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3">
                    <TransferOwnershipButton orgName={r.name} />
                  </div>
                </div>
              </details>
            </article>
          ))}
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

        {/* Audit log */}
        <section className="mt-8 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              Audit log (last {auditLog.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    No audit entries yet.
                  </td>
                </tr>
              )}
              {auditLog.map((a) => {
                const target =
                  (a.targetOrgId && (orgNameById[a.targetOrgId] ?? a.targetOrgId)) ||
                  a.targetEmail ||
                  '—'
                return (
                  <tr key={a.id} className="hover:bg-neutral-50">
                    <td
                      className="whitespace-nowrap px-4 py-2 text-xs text-neutral-500"
                      title={a.createdAt.toISOString()}
                    >
                      {relativeTime(a.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-xs text-neutral-700">
                      {a.adminEmail}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700">
                        {a.action}
                      </code>
                    </td>
                    <td className="px-4 py-2 text-xs text-neutral-700">{target}</td>
                    <td className="max-w-md truncate px-4 py-2 text-xs text-neutral-500">
                      {a.details ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

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

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-neutral-900">
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
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  )
}

function TrialBadge({ trial }: { trial: TrialStatus }) {
  if (trial.kind === 'none') {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
        No trial
      </span>
    )
  }
  if (trial.kind === 'expired') {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
        Expired
      </span>
    )
  }
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
      {trial.daysLeft}d left
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

function UsageMeter({ used, cap }: { used: number; cap: number }) {
  if (cap === 0) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-neutral-700">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600">
          Unlimited
        </span>
        <span className="text-neutral-500">
          {used} this month
        </span>
      </span>
    )
  }
  const pct = Math.min(100, Math.round((used / cap) * 100))
  const overLimit = used >= cap
  const nearLimit = !overLimit && pct >= 80
  const barCls = overLimit
    ? 'bg-red-500'
    : nearLimit
      ? 'bg-amber-500'
      : 'bg-green-500'
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        className={`tabular-nums font-semibold ${
          overLimit ? 'text-red-700' : nearLimit ? 'text-amber-700' : 'text-neutral-700'
        }`}
      >
        {used} / {cap}
      </span>
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200 sm:inline-block">
        <span
          className={`block h-full ${barCls}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-neutral-500">this month</span>
    </span>
  )
}

function RoleBadge({ role }: { role: AdminRole }) {
  const map: Record<AdminRole, string> = {
    SUPER_ADMIN: 'bg-[#CA2625]/10 text-[#CA2625]',
    ADMIN: 'bg-blue-100 text-blue-800',
    SUPPORT: 'bg-neutral-100 text-neutral-700',
  }
  return (
    <span
      className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${map[role]}`}
    >
      {role.replace('_', ' ')}
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
