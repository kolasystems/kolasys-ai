// Kolasys AI — Prisma seed
// Run: npx prisma db seed

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import "dotenv/config";

const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {});
const db = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding Kolasys AI database…')

  // ── Built-in note templates ──────────────────────────────────────────────

  const defaultTemplates = [
    {
      name: 'Standard Meeting Notes',
      isDefault: true,
      structure: [
        { title: 'Meeting Overview', prompt: 'Summarize what the meeting was about and who attended.' },
        { title: 'Key Discussion Points', prompt: 'List the main topics discussed as bullet points.' },
        { title: 'Decisions Made', prompt: 'List decisions that were made during the meeting.' },
        { title: 'Action Items', prompt: 'List action items with owners in the format: [Owner] Task.' },
        { title: 'Next Steps', prompt: 'Describe agreed next steps or follow-up meetings.' },
      ],
    },
    {
      name: 'One-on-One',
      isDefault: false,
      structure: [
        { title: 'Check-In', prompt: 'Summarize the personal check-in and how each person is doing.' },
        { title: 'Progress Updates', prompt: 'Summarize progress since the last meeting.' },
        { title: 'Blockers & Challenges', prompt: 'List any blockers or challenges discussed.' },
        { title: 'Career & Growth', prompt: 'Summarize any career development topics discussed.' },
        { title: 'Action Items', prompt: 'List agreed action items with owners.' },
      ],
    },
    {
      name: 'Product Review',
      isDefault: false,
      structure: [
        { title: 'Features Reviewed', prompt: 'List the product features or demos reviewed.' },
        { title: 'Feedback Received', prompt: 'Summarize feedback from stakeholders.' },
        { title: 'Bugs & Issues', prompt: 'List bugs or issues raised.' },
        { title: 'Prioritization Decisions', prompt: 'Summarize any prioritization or roadmap decisions.' },
        { title: 'Action Items', prompt: 'List follow-up action items.' },
      ],
    },
    {
      name: 'Sales Call',
      isDefault: false,
      structure: [
        { title: 'Prospect Overview', prompt: 'Summarize who attended and the prospect company context.' },
        { title: 'Pain Points Identified', prompt: 'List pain points or challenges the prospect mentioned.' },
        { title: 'Demo Feedback', prompt: 'Summarize how the demo was received.' },
        { title: 'Objections & Responses', prompt: 'List objections raised and how they were addressed.' },
        { title: 'Next Steps', prompt: 'Describe agreed next steps in the sales process.' },
      ],
    },
  ]

  for (const template of defaultTemplates) {
    await db.noteTemplate.upsert({
      where: {
        // Use a synthetic unique check on name + null orgId (global templates).
        id: `global-${template.name.toLowerCase().replace(/\s+/g, '-')}`,
      },
      create: {
        id: `global-${template.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: template.name,
        isDefault: template.isDefault,
        structure: template.structure,
        orgId: null,
      },
      update: {
        name: template.name,
        structure: template.structure,
        isDefault: template.isDefault,
      },
    })
    console.log(`  ✓ Template: ${template.name}`)
  }

  console.log('Seed complete.')
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
