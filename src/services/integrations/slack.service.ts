// Kolasys AI — Slack integration: post meeting notes to a Slack webhook URL

export type SlackNotePayload = {
  recordingTitle: string
  recordingUrl: string
  summary: string
  sections: Array<{ title: string; content: string }>
  actionItems: Array<{ title: string; priority: string }>
}

/** Post formatted meeting notes to a Slack incoming webhook URL. */
export async function postToSlack(
  webhookUrl: string,
  payload: SlackNotePayload
): Promise<void> {
  const { recordingTitle, recordingUrl, summary, sections, actionItems } = payload

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📝 ${recordingTitle}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Summary*\n${summary}` },
    },
  ]

  for (const section of sections) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${section.title}*\n${section.content}` },
    })
  }

  if (actionItems.length > 0) {
    blocks.push({ type: 'divider' })
    const itemList = actionItems
      .map((a) => `• [${a.priority}] ${a.title}`)
      .join('\n')
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Action Items*\n${itemList}` },
    })
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Full Notes' },
        url: recordingUrl,
        style: 'primary',
      },
    ],
  })

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook failed (${res.status}): ${body}`)
  }
}
