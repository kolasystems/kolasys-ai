# Kolasys AI — Phase 2: Planned Features

Phase 2 transforms Kolasys AI from a functional recording pipeline into a full meeting intelligence platform. Each feature below is described with the technical approach, dependencies, and implementation priority.

---

## Overview

| Feature | Priority | Effort | Dependencies |
|---|---|---|---|
| Summarisation worker | P0 | Small | Phase 1 queue infra |
| Real-time transcription progress | P0 | Medium | Polling or WebSockets |
| Action items management page | P0 | Small | Phase 1 schema |
| Custom org note templates UI | P1 | Medium | Phase 1 schema |
| Calendar sync (Google + Outlook) | P1 | Medium | OAuth, calendar APIs |
| Real-time transcription (live) | P1 | Large | Deepgram streaming |
| Vector search | P1 | Medium | pgvector or Pinecone |
| Slack integration | P2 | Medium | Slack API |
| Notion integration | P2 | Medium | Notion API |
| Sharing & public notes | P2 | Small | Phase 1 schema |
| Mobile app | P3 | XL | React Native / Expo |
| Advanced analytics | P3 | Medium | Data pipeline |

---

## P0 — Must Have Before Public Launch

### 1. Summarisation Worker

**What:** BullMQ worker that consumes jobs from the `summarization` queue (already set up in Phase 1) and generates notes using the `summarization.service.ts`.

**How:**
- Mirror the structure of `src/workers/transcription.worker.ts`
- Read transcript from DB, load org's preferred template (or default)
- Call Claude → save `Note` + `NoteSection` + `ActionItem` records
- Update `Recording.status` to `READY`

**File to create:** `src/workers/summarization.worker.ts`

**Effort:** 2–3 hours

---

### 2. Real-Time Processing Status

**What:** The recording detail page currently shows a static "Processing…" banner. Users need live feedback without manually refreshing.

**Option A: Polling (simpler)**
- Add `trpc.recordings.get.useQuery({ id }, { refetchInterval: 5_000 })` on the client
- Stop polling when `status === 'READY' || status === 'FAILED'`
- No backend changes needed

**Option B: Server-Sent Events (SSE)**
- Add a `GET /api/recordings/:id/status` SSE route
- Worker updates Redis key on status change
- Next.js SSE route streams updates to client

Recommendation: Start with polling (Option A) — it ships in 30 minutes. Upgrade to SSE in a later iteration.

---

### 3. Action Items Management Page

**What:** A dedicated `/dashboard/action-items` page where users can view, filter, assign, and update all action items across their organisation.

**How:**
- Add `actionItems` tRPC router with: `list` (filter by status/assignee), `update` (status, dueDate), `delete`
- Build `src/app/dashboard/action-items/page.tsx` as a client component
- Group by status (Open / In Progress / Completed)
- Allow inline status updates

**Schema changes:** None — `ActionItem` model already supports all required fields.

---

## P1 — Core Platform Features

### 4. Custom Org Note Templates UI

**What:** Allow org admins to create, edit, and set a default note template for their organisation.

**How:**
- Add tRPC router: `templates.list`, `templates.create`, `templates.update`, `templates.delete`, `templates.setDefault`
- UI at `/dashboard/settings/templates`
- Section builder: drag-and-drop list of `{ title, prompt }` pairs
- When generating notes, look up the org's default template before falling back to the global default

**Dependencies:** Radix UI DND or `@dnd-kit/core` for drag-and-drop section ordering.

---

### 5. Calendar Sync (Google Calendar + Outlook)

**What:** Automatically create recordings for upcoming calendar events and pre-fill the title, attendees, and meeting URL.

**How:**

**Google Calendar:**
1. Add Google OAuth scope `https://www.googleapis.com/auth/calendar.readonly`
2. Use Clerk's OAuth token storage or a separate `OAuthToken` model
3. Call Google Calendar API to list upcoming events with video conference links
4. Show "Schedule bot" button next to calendar events in a new `/dashboard/calendar` page
5. Optionally auto-deploy bots at event start time via a cron job

**Outlook:**
1. Microsoft OAuth via `@microsoft/microsoft-graph-client`
2. Same approach as Google Calendar

**New models:**
```prisma
model CalendarConnection {
  id           String @id @default(cuid())
  orgId        String
  userId       String
  provider     CalendarProvider  // GOOGLE, OUTLOOK
  accessToken  String            // encrypted
  refreshToken String            // encrypted
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}
```

**Security note:** Store OAuth tokens encrypted (AES-256) in the database, not in plain text.

---

### 6. Real-Time Transcription (Live Captions)

**What:** Show a live transcript while a browser recording or meeting bot session is in progress. This is a significant capability uplift — users can see what is being said in real time.

**How — browser recording:**
1. Replace OpenAI Whisper (batch) with **Deepgram's streaming WebSocket API** for browser recordings
2. `src/services/deepgram.service.ts` — WebSocket client wrapping Deepgram's streaming transcription
3. Client sends audio chunks via WebSocket; Deepgram returns partial + final transcripts
4. Final words are saved to `TranscriptSegment` as they arrive

**How — meeting bots:**
1. Recall.ai already has a `real_time_transcription` option (configured in Phase 1's `deployBot`)
2. Transcripts arrive at `/api/webhooks/recall` as `transcript.ready` events
3. Parse and upsert `TranscriptSegment` records in real time

**Frontend:**
- New `LiveTranscript` component subscribing to a tRPC subscription or SSE stream
- Auto-scroll to the latest segment

**New env var needed:** `DEEPGRAM_API_KEY` (already in `.env.example`)

**Effort:** L — streaming WebSocket management is complex; real-time DB writes need batching to avoid thundering-herd.

---

### 7. Vector Search

**What:** Allow users to search across all transcripts and notes with semantic similarity — "show me every meeting where we discussed pricing" rather than exact keyword matching.

**Option A: pgvector (in PostgreSQL)**
- Add `pgvector` extension to Neon
- Add `embedding vector(1536)` column to `TranscriptSegment` and `NoteSection`
- After summarisation, generate embeddings via `openai.embeddings.create({ model: 'text-embedding-3-small' })`
- Store embedding alongside the text
- Search via `<=>` cosine distance operator in Prisma raw queries

```sql
SELECT id, text, 1 - (embedding <=> $1) AS similarity
FROM "TranscriptSegment"
WHERE "transcriptId" = $2
ORDER BY similarity DESC
LIMIT 10;
```

**Option B: Pinecone (managed vector DB)**
- Upsert embeddings to Pinecone after transcription
- Query Pinecone for top-k IDs → hydrate from PostgreSQL

Recommendation: Start with pgvector (fewer services, lower latency, no extra cost) and migrate to Pinecone if query performance degrades at scale.

**New model fields:**
```prisma
// Add to TranscriptSegment and NoteSection
embedding Unsupported("vector(1536)")?
```

---

## P2 — Integrations

### 8. Slack Integration

**What:** Send a meeting summary to a Slack channel automatically when notes are generated.

**How:**
1. Add Slack OAuth flow in `/dashboard/settings/integrations`
2. Store Slack `access_token` per org (encrypted)
3. After summarisation worker completes, call `chat.postMessage` with a formatted summary block
4. Allow per-org configuration: which channel, which template, include action items or not

**New model:**
```prisma
model Integration {
  id        String          @id @default(cuid())
  orgId     String
  type      IntegrationType // SLACK, NOTION, GOOGLE_CALENDAR, etc.
  config    Json            // encrypted credentials + settings
  enabled   Boolean         @default(true)
  createdAt DateTime        @default(now())
}
```

**Slack message format:**
```
📝 *Meeting Notes: [Title]*
🕐 [Duration] · [Date]

*Summary*
[2-3 sentence summary]

*Action Items*
• [Owner] Task 1
• [Owner] Task 2

[View full notes →](link)
```

---

### 9. Notion Integration

**What:** Export meeting notes directly to a Notion page in a connected workspace.

**How:**
1. Notion OAuth flow via [Notion API](https://developers.notion.com)
2. After notes are generated, call `pages.create` with structured blocks
3. Map `NoteSection` → Notion heading + paragraph blocks
4. Map `ActionItem` → Notion to-do blocks
5. Allow user to select which Notion database to export to

---

### 10. Sharing & Public Notes

**What:** Allow users to share a note via a public URL without requiring sign-in.

**How:**
- `Note.isPublic` field already exists in Phase 1 schema
- Add `Note.shareToken` (random 12-char slug)
- Add tRPC mutation `notes.togglePublic` that generates/clears the share token
- Add route `src/app/share/[token]/page.tsx` — public server-rendered note view
- Add "Copy share link" button on the note detail page

**Security:** Share tokens must be unguessable (use `crypto.randomBytes(12).toString('hex')`). Public notes must not expose org membership or user details.

---

## P3 — Scale & Growth

### 11. Mobile App

**What:** A React Native / Expo app for recording meetings from a phone — particularly useful for in-person meetings.

**Approach:**
- Expo with `expo-av` for audio recording
- Same Clerk auth (Clerk supports React Native)
- Same tRPC API (works over HTTP from any client)
- Upload audio to S3 via the same `getUploadUrl` flow
- Push notifications when transcription is complete

**Effort:** XL — React Native is a separate platform requiring native module expertise. Recommend contracting a mobile developer.

---

### 12. Advanced Analytics

**What:** Org-level dashboards showing meeting trends: meetings per week, average duration, action item completion rate, most frequent topics.

**How:**
- Aggregate queries on `Recording`, `Note`, `ActionItem`
- Cache computed stats in Redis with a 1-hour TTL
- New `src/app/dashboard/analytics/page.tsx` with charts (Recharts or Chart.js)
- Optional: topic modelling via Claude — ask Claude to tag each meeting with 3-5 topic labels → store on `Note` → aggregate in analytics

---

## Migration Strategy

Phase 2 features are additive — no breaking schema changes are expected. The only schema additions planned are:

```prisma
// New in Phase 2
model CalendarConnection { ... }
model Integration { ... }

// Additions to existing models
Note {
  shareToken String? @unique
}
TranscriptSegment {
  embedding Unsupported("vector(1536)")?
}
```

Run `prisma migrate dev` (switching from `db push` to proper migrations) before Phase 2 development to establish a migration baseline.
