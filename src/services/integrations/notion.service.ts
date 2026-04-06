// Kolasys AI — Notion integration: create a meeting notes page in a Notion database

import { Client, isFullPage } from '@notionhq/client'

export type NotionNotePayload = {
  recordingTitle: string
  recordingUrl: string
  summary: string
  sections: Array<{ title: string; content: string }>
  actionItems: Array<{ title: string; priority: string }>
  createdAt: Date
}

/** Create a Notion page with full meeting notes in a database. */
export async function createNotionPage(
  apiKey: string,
  databaseId: string,
  payload: NotionNotePayload
): Promise<string> {
  const notion = new Client({ auth: apiKey })
  const { recordingTitle, recordingUrl, summary, sections, actionItems, createdAt } = payload

  // Build the children blocks
  const children: object[] = [
    {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [{ type: 'text', text: { content: summary } }],
        icon: { emoji: '📋' },
        color: 'blue_background',
      },
    },
  ]

  for (const section of sections) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: section.title } }],
      },
    })
    // Split long content into 2000-char blocks (Notion limit per block)
    const content = section.content
    for (let i = 0; i < content.length; i += 2000) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: content.slice(i, i + 2000) } }],
        },
      })
    }
  }

  if (actionItems.length > 0) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '✅ Action Items' } }],
      },
    })
    for (const item of actionItems) {
      children.push({
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: [
            { type: 'text', text: { content: `[${item.priority}] ${item.title}` } },
          ],
          checked: false,
        },
      })
    }
  }

  // Add a link back to Kolasys
  children.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        { type: 'text', text: { content: '🔗 ' } },
        {
          type: 'text',
          text: { content: 'View in Kolasys AI', link: { url: recordingUrl } },
        },
      ],
    },
  })

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      // Assumes the database has a "Name" / "title" property
      Name: {
        title: [{ type: 'text', text: { content: recordingTitle } }],
      },
      // Optional date property — silently ignored if the DB doesn't have it
      Date: { date: { start: createdAt.toISOString().split('T')[0] } },
    },
    children: children as Parameters<typeof notion.pages.create>[0]['children'],
  })

  if (isFullPage(page)) return page.url
  return ''
}
