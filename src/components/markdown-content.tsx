'use client'

// Kolasys AI — Shared Markdown renderer for note content, summaries, and
// action-item descriptions. Uses react-markdown + remark-gfm (tables,
// strikethrough, autolinks, task lists) with Tailwind-styled overrides so the
// output looks right in both light and dark modes without @tailwindcss/typography.

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

type Props = {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: Props) {
  return (
    <div
      className={cn(
        'markdown-body space-y-2 text-sm leading-relaxed text-primary',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="text-sm leading-relaxed text-primary">{children}</p>
          ),
          h1: ({ children }) => (
            <h1 className="mt-3 text-base font-bold text-primary">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 text-sm font-bold text-primary">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 text-sm font-semibold text-primary">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-1 marker:text-accent">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-1 marker:text-accent">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed text-primary">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-primary">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => (
            <del className="text-muted">{children}</del>
          ),
          code: ({ children, className: cls }) => {
            // react-markdown wraps block code in <pre><code>; only the inline
            // variant has no language class. Style inline code compactly.
            const isBlock = /language-/.test(cls ?? '')
            if (isBlock) {
              return (
                <code className={cn('font-mono text-xs', cls)}>{children}</code>
              )
            }
            return (
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-primary dark:bg-white/10">
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 text-xs text-primary dark:bg-white/5">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-3 italic text-secondary">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-t border-line" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-line px-2 py-1 text-left font-semibold text-primary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-line px-2 py-1 text-primary">{children}</td>
          ),
          input: (props) => {
            // GFM task-list checkbox. Disabled — the real state lives in the
            // ActionItem row; this is display-only.
            if (props.type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  disabled
                  checked={!!props.checked}
                  readOnly
                  className="mr-1.5 h-3.5 w-3.5 rounded border-line align-middle accent-[var(--accent)]"
                />
              )
            }
            return <input {...props} />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
