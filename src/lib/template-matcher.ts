// Kolasys AI — Pure auto-apply template matcher.
// Shared by the server (summarization worker) and client (new-recording
// modal hint). No imports from db / server-only modules so it's safe to
// bundle into the browser.

export type AutoApplyRule = {
  field: 'title' | 'attendees'
  pattern: string
  priority: number
}

export type MatchableTemplate = {
  id: string
  name: string
  autoApplyRules: unknown
}

/**
 * Given a list of templates (with their autoApplyRules JSON) and a title +
 * attendee list, returns the highest-priority matching template, or null.
 * Invalid regex patterns are silently skipped — they don't crash the match.
 */
export function pickAutoApplyTemplate(
  templates: MatchableTemplate[],
  meetingTitle: string,
  attendees: string[] = [],
): { id: string; name: string; priority: number } | null {
  let best: { id: string; name: string; priority: number } | null = null

  for (const template of templates) {
    const rules = normalizeRules(template.autoApplyRules)
    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'i')
        const target = rule.field === 'title' ? meetingTitle : attendees.join(' ')
        if (regex.test(target)) {
          if (!best || rule.priority > best.priority) {
            best = { id: template.id, name: template.name, priority: rule.priority }
          }
        }
      } catch {
        /* invalid regex — skip */
      }
    }
  }

  return best
}

function normalizeRules(json: unknown): AutoApplyRule[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((r) => {
    if (!r || typeof r !== 'object') return []
    const obj = r as Record<string, unknown>
    if (
      (obj.field === 'title' || obj.field === 'attendees') &&
      typeof obj.pattern === 'string' &&
      typeof obj.priority === 'number'
    ) {
      return [obj as AutoApplyRule]
    }
    return []
  })
}
