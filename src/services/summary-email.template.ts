// Kolasys AI — Summary email HTML template
// Pure function: takes structured data, returns an HTML string.
// Uses `marked` to render Claude-generated markdown in NoteSection.content.

import { marked } from 'marked'

export interface SummaryEmailData {
  title: string
  recordingUrl: string
  noteSummary: string | null        // Note.summary (short overview)
  sections: Array<{ title: string; content: string }>  // NoteSection rows ordered by `order`
  actionItems: Array<{ title: string }>
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mdToHtml(markdown: string): string {
  // marked.parse is synchronous in v13+; cast for TypeScript.
  return marked.parse(markdown) as string
}

export function buildSummaryEmailHtml(data: SummaryEmailData): string {
  const { title, recordingUrl, noteSummary, sections, actionItems } = data

  const summaryBlock = noteSummary
    ? `<h2 style="color:#1e293b;font-size:16px;margin:0 0 8px;">Summary</h2>
<p style="color:#475569;line-height:1.6;margin:0 0 28px;">${esc(noteSummary)}</p>`
    : ''

  const sectionsBlock = sections.length
    ? sections
        .map(
          (s) => `
<h2 style="color:#1e293b;font-size:15px;margin:0 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${esc(s.title)}</h2>
<div style="color:#475569;line-height:1.7;margin:0 0 24px;font-size:14px;">${mdToHtml(s.content)}</div>`,
        )
        .join('')
    : ''

  const actionBlock =
    actionItems.length > 0
      ? `<h2 style="color:#1e293b;font-size:16px;margin:0 0 10px;">Action Items (${actionItems.length})</h2>
<div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin:0 0 28px;">
${actionItems
  .slice(0, 10)
  .map((a) => `  <p style="margin:4px 0;color:#475569;">• ${esc(a.title)}</p>`)
  .join('\n')}
${actionItems.length > 10 ? `  <p style="color:#94a3b8;margin:8px 0 0;font-size:13px;">+ ${actionItems.length - 10} more</p>` : ''}
</div>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px 32px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.75);font-size:12px;text-transform:uppercase;letter-spacing:.06em;">Meeting Notes Ready</p>
    <h1 style="margin:0;color:#ffffff;font-size:20px;line-height:1.3;">${esc(title)}</h1>
  </div>

  <!-- Body -->
  <div style="padding:32px;">
    ${summaryBlock}
    ${sectionsBlock}
    ${actionBlock}

    <a href="${recordingUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#667eea,#764ba2);color:#ffffff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      View Full Notes →
    </a>
  </div>

  <!-- Footer -->
  <div style="padding:18px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;">
    <p style="margin:0;color:#94a3b8;font-size:12px;">
      Kolasys AI · AI-powered meeting intelligence ·
      <a href="${recordingUrl}" style="color:#94a3b8;">View in app</a>
    </p>
  </div>

</div>
</body>
</html>`
}
