// Kolasys AI — Action Items page

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ListChecks, CheckCircle2, Circle, Clock } from 'lucide-react'
import { db } from '@/lib/db'

export const metadata = { title: 'Action Items — Kolasys AI' }

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'bg-neutral-100 text-neutral-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

export default async function ActionItemsPage() {
  const { orgId: clerkOrgId } = await auth()
  if (!clerkOrgId) redirect('/dashboard')

  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true },
  })

  const actionItems = org
    ? await db.actionItem.findMany({
        where: { orgId: org.id, status: { not: 'CANCELLED' } },
        include: {
          note: {
            select: {
              recording: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      })
    : []

  const open = actionItems.filter((i) => i.status === 'OPEN')
  const inProgress = actionItems.filter((i) => i.status === 'IN_PROGRESS')
  const completed = actionItems.filter((i) => i.status === 'COMPLETED')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Action Items</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tasks extracted from your meeting notes.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span className="flex items-center gap-1.5">
            <Circle className="h-3.5 w-3.5 text-blue-500" />
            {open.length} open
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-orange-500" />
            {inProgress.length} in progress
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            {completed.length} done
          </span>
        </div>
      </div>

      {actionItems.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 text-center">
          <ListChecks className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-500">No action items yet</p>
          <p className="mt-1 text-xs text-neutral-400">
            Action items are extracted automatically from your meeting notes.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {[
            { label: 'Open', items: open, icon: <Circle className="h-4 w-4 text-blue-500" /> },
            { label: 'In Progress', items: inProgress, icon: <Clock className="h-4 w-4 text-orange-500" /> },
            { label: 'Completed', items: completed, icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <section key={group.label}>
                <div className="mb-3 flex items-center gap-2">
                  {group.icon}
                  <h2 className="text-sm font-semibold text-neutral-700">
                    {group.label} · {group.items.length}
                  </h2>
                </div>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={
                            item.status === 'COMPLETED'
                              ? 'text-sm font-medium text-neutral-400 line-through'
                              : 'text-sm font-medium text-neutral-900'
                          }
                        >
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="mt-0.5 text-xs text-neutral-500 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-neutral-400">
                          From:{' '}
                          <a
                            href={`/dashboard/recordings/${item.note.recording.id}`}
                            className="text-brand-600 hover:underline"
                          >
                            {item.note.recording.title}
                          </a>
                          {item.dueDate && (
                            <span className="ml-3">
                              Due {new Date(item.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.MEDIUM}`}
                      >
                        {PRIORITY_LABEL[item.priority] ?? item.priority}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  )
}
