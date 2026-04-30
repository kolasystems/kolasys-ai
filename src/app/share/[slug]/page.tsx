// Kolasys AI — Public share page. No auth required. Renders title, AI
// notes, transcript text, and action items for any recording whose owner
// flipped isPublic=true and minted a publicSlug. Audio stays private —
// no S3 URL is generated server-side.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { KolasysLogoMark } from '@/components/kolasys-logo'
import { MarkdownContent } from '@/components/markdown-content'
import { CheckCircle2, Mic2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const recording = await db.recording.findFirst({
    where: { publicSlug: slug, isPublic: true },
    select: { title: true },
  })
  if (!recording) return { title: 'Not found — Kolasys AI' }
  return {
    title: `${recording.title} — Kolasys AI`,
    description: 'AI-generated meeting notes shared via Kolasys AI.',
  }
}

export default async function SharePage({ params }: Props) {
  const { slug } = await params

  const recording = await db.recording.findFirst({
    where: { publicSlug: slug, isPublic: true },
    select: {
      id: true,
      title: true,
      createdAt: true,
      duration: true,
      sharePermissions: true,
      shareExpiresAt: true,
      transcript: { select: { text: true } },
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          summary: true,
          sections: {
            orderBy: { order: 'asc' },
            select: { id: true, title: true, content: true },
          },
          actionItems: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, title: true, description: true, priority: true, status: true },
          },
        },
      },
    },
  })

  if (!recording) notFound()

  // Expiry check — render an "expired" page if shareExpiresAt is in the past.
  if (
    recording.shareExpiresAt &&
    recording.shareExpiresAt.getTime() < Date.now()
  ) {
    return <ExpiredView />
  }

  // Permission gates — null means everything-on (legacy).
  const perms = parsePerms(recording.sharePermissions)
  const note = recording.notes[0] ?? null

  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      {/* Top bar */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <KolasysLogoMark size={20} className="text-black" />
            <span className="text-sm font-semibold tracking-tight text-neutral-900">
              Kolasys <span style={{ color: '#CA2625' }}>AI</span>
            </span>
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: '#CA2625' }}
          >
            Try Kolasys AI free
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Shared meeting notes
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          {recording.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {new Date(recording.createdAt).toLocaleDateString(undefined, {
            month: 'long', day: 'numeric', year: 'numeric',
          })}
          {recording.duration ? ` · ${Math.round(recording.duration / 60)} min` : ''}
        </p>

        {/* Summary */}
        {perms.summary && note?.summary && (
          <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm" style={{ borderLeft: '3px solid #CA2625' }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#CA2625]">
              Summary
            </p>
            <div className="mt-2">
              <MarkdownContent content={note.summary} />
            </div>
          </section>
        )}

        {/* Sections — included with the Summary permission since they're
            generated alongside it. */}
        {perms.summary && note?.sections.map((section) => (
          <section
            key={section.id}
            className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
            style={{ borderLeft: '3px solid #CA2625' }}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-700">
              {section.title}
            </h2>
            <div className="mt-2">
              <MarkdownContent content={section.content} />
            </div>
          </section>
        ))}

        {/* Action items */}
        {perms.actionItems && note?.actionItems && note.actionItems.length > 0 && (
          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm" style={{ borderLeft: '3px solid #CA2625' }}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-700">
              <CheckCircle2 className="h-4 w-4" /> Action items
            </h2>
            <ul className="space-y-2.5">
              {note.actionItems.map((a) => (
                <li key={a.id} className="rounded-lg bg-neutral-50 p-3">
                  <p className="text-sm font-medium text-neutral-900">{a.title}</p>
                  {a.description && (
                    <p className="mt-0.5 text-xs text-neutral-600">{a.description}</p>
                  )}
                  <div className="mt-1.5 flex gap-2 text-[10px] uppercase tracking-wider">
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-neutral-200">
                      {a.priority}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-neutral-200">
                      {a.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Transcript */}
        {perms.transcript && recording.transcript?.text && (
          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-700">
              <Mic2 className="h-4 w-4" /> Transcript
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
              {recording.transcript.text}
            </p>
          </section>
        )}

        {/* Footer CTA */}
        <footer className="mt-12 rounded-2xl border border-[#CA2625]/20 bg-[#CA2625]/5 p-6 text-center">
          <p className="text-sm font-medium text-neutral-900">
            Generated by Kolasys AI — meeting notes that write themselves.
          </p>
          <Link
            href="/sign-up"
            className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: '#CA2625' }}
          >
            Start free
          </Link>
        </footer>
      </main>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

type SharePerms = { transcript: boolean; summary: boolean; actionItems: boolean }

/** Tolerantly parse the `sharePermissions` JSON column. null → everything on
 *  (legacy default before per-share permissions existed). */
function parsePerms(raw: unknown): SharePerms {
  if (raw && typeof raw === 'object') {
    const p = raw as Partial<SharePerms>
    return {
      transcript: p.transcript ?? true,
      summary: p.summary ?? true,
      actionItems: p.actionItems ?? true,
    }
  }
  return { transcript: true, summary: true, actionItems: true }
}

function ExpiredView() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FC] px-6 text-center">
      <KolasysLogoMark size={28} className="mb-4 text-black" />
      <h1 className="text-xl font-bold text-neutral-900">This link has expired</h1>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        The owner of this recording set an expiry on the share link. Reach out to
        them directly if you still need access.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: '#CA2625' }}
      >
        Try Kolasys AI free
      </Link>
    </div>
  )
}
