// Kolasys AI — Prisma seed
// Run: npx prisma db seed

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import "dotenv/config";

const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {});
const db = new PrismaClient({ adapter })

type TemplateSeed = {
  slug: string
  name: string
  description: string
  category: string
  prompt: string
  isDefault?: boolean
  structure: Array<{ title: string; prompt: string }>
}

async function main() {
  console.log('Seeding Kolasys AI database…')

  // ── Built-in "AI Skills" / note templates ────────────────────────────────

  const templates: TemplateSeed[] = [
    {
      slug: 'meeting-summary',
      name: 'Meeting Summary',
      description: 'A concise, general-purpose summary for any meeting.',
      category: 'Meeting',
      isDefault: true,
      prompt:
        'You are a meeting notes assistant. Produce a clear, concise summary with the most important takeaways. Favour clarity over completeness.',
      structure: [
        { title: 'Overview', prompt: 'Summarise what the meeting was about and who attended in 2–3 sentences.' },
        { title: 'Key Discussion Points', prompt: 'List the main topics discussed as bullet points.' },
        { title: 'Decisions', prompt: 'List decisions that were made. If none, write "No decisions recorded."' },
        { title: 'Action Items', prompt: 'List action items with owners in the format "- [Owner] Task".' },
        { title: 'Next Steps', prompt: 'Describe agreed next steps or follow-up meetings.' },
      ],
    },
    {
      slug: 'meeting-minutes',
      name: 'Meeting Minutes',
      description: 'Formal minutes with attendees, agenda, and resolutions.',
      category: 'Meeting',
      prompt:
        'You are a corporate secretary producing formal meeting minutes. Use neutral, professional language. Record attendees, motions, and resolutions verbatim where possible.',
      structure: [
        { title: 'Attendees', prompt: 'List attendees and their roles if stated.' },
        { title: 'Agenda', prompt: 'List the agenda items covered.' },
        { title: 'Discussion', prompt: 'For each agenda item, record the discussion in neutral, third-person prose.' },
        { title: 'Motions & Resolutions', prompt: 'Record any motions raised, who moved/seconded, and the outcome.' },
        { title: 'Action Items', prompt: 'List action items with owner and due date.' },
        { title: 'Adjournment', prompt: 'Record the time of adjournment and the next scheduled meeting.' },
      ],
    },
    {
      slug: 'soap-note',
      name: 'SOAP Note',
      description: 'Clinical note in the Subjective / Objective / Assessment / Plan format.',
      category: 'Medical',
      prompt:
        'You are a clinical scribe. Produce a SOAP note from the encounter. Be accurate, concise, and use standard medical terminology. Do NOT fabricate clinical findings — only record what is stated in the transcript.',
      structure: [
        { title: 'Subjective', prompt: 'Record the patient\'s chief complaint, history of present illness, and relevant subjective information in the patient\'s own words where possible.' },
        { title: 'Objective', prompt: 'Record measurable observations: vitals, physical exam findings, and test results mentioned.' },
        { title: 'Assessment', prompt: 'Summarise the clinician\'s assessment and differential diagnoses discussed.' },
        { title: 'Plan', prompt: 'Record the treatment plan: medications, follow-ups, referrals, and patient education.' },
      ],
    },
    {
      slug: 'sales-call',
      name: 'Sales Call',
      description: 'Discovery + qualification notes for sales conversations.',
      category: 'Sales',
      prompt:
        'You are a sales ops assistant. Extract structured qualification data (BANT/MEDDIC-style) and next steps from the sales call. Favour verbatim quotes for pain points.',
      structure: [
        { title: 'Prospect Overview', prompt: 'Summarise the company, attendees, and role / seniority of each participant.' },
        { title: 'Pain Points', prompt: 'List pain points mentioned by the prospect. Include direct quotes where available.' },
        { title: 'Budget & Timeline', prompt: 'Record any discussion of budget, procurement process, or timeline.' },
        { title: 'Decision Makers', prompt: 'Identify decision makers, champions, and blockers mentioned.' },
        { title: 'Objections', prompt: 'List objections raised and how they were handled.' },
        { title: 'Next Steps', prompt: 'Record agreed next steps and follow-up dates.' },
      ],
    },
    {
      slug: 'one-on-one',
      name: '1:1 Meeting',
      description: 'Manager / report check-in with growth, blockers, and feedback.',
      category: 'Meeting',
      prompt:
        'You are a manager-coach assistant. Summarise a one-on-one in a human, empathetic tone. Capture blockers, wins, and development topics. Do not include commentary that the person did not say.',
      structure: [
        { title: 'Check-In', prompt: 'Summarise the personal check-in and how the person is doing.' },
        { title: 'Wins & Progress', prompt: 'List wins and progress since the last meeting.' },
        { title: 'Blockers', prompt: 'List blockers or challenges and any proposed solutions.' },
        { title: 'Feedback', prompt: 'Record feedback exchanged in either direction.' },
        { title: 'Career & Growth', prompt: 'Summarise any career development topics discussed.' },
        { title: 'Action Items', prompt: 'List agreed action items with owners.' },
      ],
    },
    {
      slug: 'action-items-only',
      name: 'Action Items Only',
      description: 'Strip everything except the action items.',
      category: 'Minimal',
      prompt:
        'You extract only action items. Ignore discussion, context, and commentary. Output every task, commitment, or follow-up mentioned — and nothing else.',
      structure: [
        { title: 'Action Items', prompt: 'List every action item, task, or commitment as bullet points. Format: "- [Owner] Task — due [Date if mentioned]". If no owner is stated, use "TBD".' },
      ],
    },
    {
      slug: 'daily-standup',
      name: 'Daily Standup',
      description: 'Yesterday / today / blockers per participant.',
      category: 'Meeting',
      prompt:
        'You produce daily standup notes. Group content by participant. Use short bullet points. Do not invent participants — only include people who spoke in the transcript.',
      structure: [
        { title: 'Yesterday', prompt: 'For each participant, list what they said they did yesterday as bullet points under their name.' },
        { title: 'Today', prompt: 'For each participant, list what they said they plan to do today.' },
        { title: 'Blockers', prompt: 'List any blockers raised, grouped by participant.' },
        { title: 'Team Announcements', prompt: 'Record any team-wide announcements or follow-ups. If none, omit this section.' },
      ],
    },
  ]

  for (const tpl of templates) {
    const id = `global-${tpl.slug}`
    // HTTP mode — no upsert. findFirst → create OR update.
    const existing = await db.noteTemplate.findUnique({ where: { id }, select: { id: true } })
    const data = {
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      prompt: tpl.prompt,
      structure: tpl.structure,
      isDefault: !!tpl.isDefault,
      orgId: null,
    }
    if (existing) {
      await db.noteTemplate.update({ where: { id }, data })
    } else {
      await db.noteTemplate.create({ data: { id, ...data } })
    }
    console.log(`  ✓ Template: ${tpl.name}`)
  }

  // Clear isDefault on any legacy template other than the canonical default.
  const defaultId = 'global-meeting-summary'
  const strayDefaults = await db.noteTemplate.findMany({
    where: { isDefault: true, NOT: { id: defaultId } },
    select: { id: true },
  })
  for (const row of strayDefaults) {
    await db.noteTemplate.update({ where: { id: row.id }, data: { isDefault: false } })
  }

  console.log('Seed complete.')
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
