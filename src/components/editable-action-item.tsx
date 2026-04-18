'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import * as Select from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { MarkdownContent } from './markdown-content'

// Local string-union types — never import Prisma enums in client components.
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
]

const PRIORITY_DOT: Record<Priority, string> = {
  LOW: 'bg-neutral-300',
  MEDIUM: 'bg-yellow-400',
  HIGH: 'bg-orange-400',
  URGENT: 'bg-red-500',
}

const PRIORITY_TEXT: Record<Priority, string> = {
  LOW: 'text-neutral-500',
  MEDIUM: 'text-yellow-700',
  HIGH: 'text-orange-700',
  URGENT: 'text-red-700',
}

type Props = {
  itemId: string
  title: string
  description?: string | null
  initialStatus: ActionItemStatus
  initialPriority: Priority
  dueDate: Date | null
}

export function EditableActionItem({
  itemId,
  title,
  description,
  initialStatus,
  initialPriority,
  dueDate,
}: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [priority, setPriority] = useState(initialPriority)

  const mutation = trpc.recordings.updateActionItem.useMutation()

  function toggleDone() {
    const next: ActionItemStatus = status === 'COMPLETED' ? 'OPEN' : 'COMPLETED'
    setStatus(next)
    mutation.mutate({ id: itemId, status: next })
  }

  function changePriority(next: Priority) {
    setPriority(next)
    mutation.mutate({ id: itemId, priority: next })
  }

  const done = status === 'COMPLETED'

  return (
    <li className="flex items-start gap-3 text-sm">
      {/* Checkbox */}
      <button
        type="button"
        onClick={toggleDone}
        aria-label={done ? 'Mark as open' : 'Mark as done'}
        className={cn(
          'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors',
          done
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-neutral-300 hover:border-brand-500 dark:border-white/20'
        )}
      >
        {done && <Check className="h-2.5 w-2.5" />}
      </button>

      {/* Title + optional description */}
      <div className="flex-1 min-w-0">
        <span className={cn('text-primary', done && 'text-muted line-through')}>
          {title}
          {dueDate && (
            <span className="ml-2 text-xs text-muted">
              due {new Date(dueDate).toLocaleDateString()}
            </span>
          )}
        </span>
        {description && (
          <div className={cn('mt-1', done && 'opacity-60')}>
            <MarkdownContent content={description} className="text-xs text-secondary" />
          </div>
        )}
      </div>

      {/* Priority picker */}
      <Select.Root value={priority} onValueChange={(v) => changePriority(v as Priority)}>
        <Select.Trigger
          className={cn(
            'mt-0.5 flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-neutral-100 focus:outline-none dark:hover:bg-white/10',
            PRIORITY_TEXT[priority]
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[priority])} />
          <Select.Value />
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            position="popper"
            side="bottom"
            align="end"
            className="z-50 min-w-[100px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#1A1A24]"
          >
            <Select.Viewport className="p-1">
              {PRIORITY_OPTIONS.map((opt) => (
                <Select.Item
                  key={opt.value}
                  value={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-primary outline-none hover:bg-neutral-100 data-[highlighted]:bg-neutral-100 dark:hover:bg-white/10 dark:data-[highlighted]:bg-white/10"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[opt.value])} />
                  <Select.ItemText>{opt.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </li>
  )
}
