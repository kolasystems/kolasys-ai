'use client'

// Kolasys AI — Client-side analytics view. Fetches aggregated stats via
// trpc.analytics.getStats and renders gradient stat cards, a speaker
// talk-time bar chart, a weekly meeting-frequency line chart, and a
// recent recordings table.

import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart2,
  CheckSquare,
  Clock,
  FileText,
  Mic2,
  TimerReset,
  Users,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { formatDuration } from '@/lib/utils'
import { GradientStatCard } from './gradient-stat-card'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTotalDuration(totalSeconds: number): string {
  if (!totalSeconds) return '0m'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatRelative(date: Date | string): string {
  const d = new Date(date)
  const diffMs = Date.now() - d.getTime()
  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Main view ────────────────────────────────────────────────────────────────

export function AnalyticsView() {
  const { data, isLoading, error } = trpc.analytics.getStats.useQuery()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
        <div className="skeleton h-72" />
        <div className="skeleton h-72" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        Failed to load analytics: {error.message}
      </div>
    )
  }

  if (!data) return null

  const hasSpeakerData = data.speakerTalkTime.length > 0

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── 1. Top stats row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GradientStatCard
          variant="recordings"
          icon={Mic2}
          label="Total Meetings"
          value={data.totalMeetings}
        />
        <GradientStatCard
          variant="notes"
          icon={Clock}
          label="Total Talk Time"
          value={data.totalDuration}
          displayValue={formatTotalDuration(data.totalDuration)}
        />
        <GradientStatCard
          variant="actionitems"
          icon={CheckSquare}
          label="Action Items Created"
          value={data.totalActionItems}
        />
        <GradientStatCard
          variant="checkins"
          icon={TimerReset}
          label="Avg Meeting (min)"
          value={Math.round(data.avgDuration / 60)}
        />
      </div>

      {/* ── 2. Meeting frequency (last 12 weeks) ───────────────────── */}
      <ChartCard
        title="Meeting frequency"
        subtitle="Recordings per week, last 12 weeks"
        icon={<BarChart2 className="h-4 w-4 text-accent" />}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <LineChart data={data.weeklyData} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="label"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: 'var(--accent)', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* ── 3. Speaker talk time ───────────────────────────────────── */}
      <ChartCard
        title="Speaker talk time"
        subtitle="Top speakers across all meetings (diarized audio only)"
        icon={<Users className="h-4 w-4 text-accent" />}
      >
        {hasSpeakerData ? (
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart
                data={data.speakerTalkTime.map((s) => ({
                  name: s.name,
                  minutes: Math.round(s.seconds / 60),
                }))}
                margin={{ top: 10, right: 16, bottom: 0, left: -12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="minutes"
                  fill="var(--accent)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-3 h-8 w-8 text-muted" />
            <p className="text-sm font-medium text-secondary">
              Not enough speaker data yet
            </p>
            <p className="mt-1 text-xs text-muted">
              Enable Deepgram diarization and process a meeting with multiple speakers.
            </p>
          </div>
        )}
      </ChartCard>

      {/* ── 4. Recent activity ─────────────────────────────────────── */}
      <ChartCard
        title="Recent activity"
        subtitle="Your last 10 ready recordings"
        icon={<FileText className="h-4 w-4 text-accent" />}
      >
        {data.recentRecordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Mic2 className="mb-3 h-8 w-8 text-muted" />
            <p className="text-sm font-medium text-secondary">No recordings yet</p>
          </div>
        ) : (
          <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-2 font-semibold sm:px-5">Title</th>
                  <th className="px-4 py-2 font-semibold sm:px-5">Date</th>
                  <th className="px-4 py-2 font-semibold sm:px-5">Duration</th>
                  <th className="px-4 py-2 font-semibold sm:px-5">Notes</th>
                  <th className="px-4 py-2 font-semibold sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.recentRecordings.map((r) => (
                  <tr key={r.id} className="group transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
                    <td className="px-4 py-3 sm:px-5">
                      <Link
                        href={`/dashboard/recordings/${r.id}`}
                        className="font-medium text-primary group-hover:text-accent"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-secondary sm:px-5">
                      {formatRelative(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-secondary sm:px-5">
                      {r.duration != null ? formatDuration(r.duration) : '—'}
                    </td>
                    <td className="px-4 py-3 text-secondary sm:px-5">{r.noteCount}</td>
                    <td className="px-4 py-3 text-secondary sm:px-5">{r.actionItemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}

// ── Reusable chart card ────────────────────────────────────────────────────

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1A1A24] sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

// ── Recharts tooltip — themed for light/dark ───────────────────────────────

type TooltipPayloadEntry = {
  name?: string
  value?: number | string
  dataKey?: string | number
}

type ChartTooltipProps = {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
      {label !== undefined && (
        <p className="font-medium text-primary">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="text-secondary">
          {p.name ?? p.dataKey}: <span className="font-semibold text-accent">{p.value}</span>
        </p>
      ))}
    </div>
  )
}
