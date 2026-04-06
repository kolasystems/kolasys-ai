# Kolasys AI — Phase 2: Full Roadmap & Audit List

Phase 2 transforms Kolasys AI from a functional recording pipeline into a full meeting intelligence platform.

This document is the **definitive roadmap** — it includes the complete 30-item audit list (P0 → P3) generated in Session 3, plus the original Phase 2 feature descriptions.

---

## 30-Item Audit List

Audited 2026-04-06. Items are ordered within each priority tier by implementation dependency (earlier items unblock later ones).

---

### P0 — Must Fix Before Sharing With Anyone

These are correctness, security, or data integrity issues. The app should not be shared with external users until all P0s are resolved.

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | `server-only` blocking workers | ✅ Fixed | Removed from `db.ts`, `storage.ts` |
| 2 | `$transaction` not supported in HTTP mode | ✅ Fixed | Replaced with sequential calls |
| 3 | `upsert` not supported in HTTP mode | ✅ Fixed | Replaced with findUnique + create/update |
| 4 | Nested writes causing implicit transaction errors | ✅ Fixed | Flattened to sequential creates |
| 5 | Org FK constraint on first recording (webhook race) | ✅ Fixed | Auto-provision org in orgProcedure |
| 6 | `recordings.get` not org-scoped (data leak) | ✅ Fixed | Added orgId check + FORBIDDEN |
| 7 | S3 audio files never deleted after transcription | ✅ Fixed | Delete after transcript committed |
| 8 | Worker env vars not loading (dotenv missing) | ✅ Fixed | `import 'dotenv/config'` in workers |
| 9 | `recordings.list` not org-scoped | ✅ Fixed | All list queries filtered by `ctx.orgId` |
| 10 | Action items not org-scoped in queries | ✅ Fixed | Added `orgId` filter to all actionItem queries |

---

### P1 — Core UX — Must Have Before Public Launch

These make the product usable and trustworthy for real users.

| # | Item | Status | Notes |
|---|---|---|---|
| 11 | Real-time processing status on recording detail page | 🔄 In progress | Poll `recordings.get` every 5s while PROCESSING |
| 12 | Action items management page (`/dashboard/action-items`) | 🔄 In progress | List, filter, update status, assign |
| 13 | Settings page (`/dashboard/settings`) | 🔄 In progress | Org name, plan, note templates, API keys |
| 14 | Error state on recording detail (status = FAILED) | ⬜ Todo | Show error message + retry button |
| 15 | Whisper 25 MB file size limit handling | ⬜ Todo | Reject at upload with clear error message |
| 16 | Worker Dockerfile for Railway/Render deployment | ⬜ Todo | Required to run workers in prod |
| 17 | Clerk webhook org sync (needs `CLERK_WEBHOOK_SECRET`) | ⬜ Todo | Auto-provisioning is workaround; webhook is authoritative |
| 18 | Empty state UI for new orgs with no recordings | ⬜ Todo | Show onboarding prompt instead of empty list |
| 19 | `ProcessingJob` audit log visible in UI | ⬜ Todo | Show job history on recording detail for debugging |
| 20 | Rate limiting on tRPC mutations | ⬜ Todo | Prevent abuse of upload + bot deploy endpoints |

---

### P2 — Platform Features — After First Public Users

| # | Item | Status | Notes |
|---|---|---|---|
| 21 | Custom org note templates UI | ⬜ Todo | CRUD UI for NoteTemplate — already in schema |
| 22 | Calendar sync (Google Calendar + Outlook) | ⬜ Todo | See feature spec below |
| 23 | Real-time transcription (live captions) | ⬜ Todo | Deepgram streaming WebSocket |
| 24 | Vector search across transcripts + notes | ⬜ Todo | pgvector on Neon (see spec below) |
| 25 | Slack integration — post summary after meeting | ⬜ Todo | OAuth + `chat.postMessage` |
| 26 | Notion integration — export notes as page | ⬜ Todo | Notion API OAuth + blocks |
| 27 | Public note sharing via share token | ⬜ Todo | `Note.shareToken` + `/share/[token]` route |
| 28 | Email digest — weekly meeting summary | ⬜ Todo | Scheduled job → Resend/SendGrid |

---

### P3 — Growth & Scale

| # | Item | Status | Notes |
|---|---|---|---|
| 29 | Mobile app (React Native + Expo) | ⬜ Todo | See `docs/MOBILE_STRATEGY.md` |
| 30 | Advanced analytics dashboard | ⬜ Todo | Meeting trends, action item completion rate |

---

## Feature Specifications

---

### P1 — Real-Time Processing Status (Item 11)

**What:** The recording detail page currently shows a static "Processing…" banner. Users need live feedback.

**Option A: Polling (ship in 30 minutes)**
```typescript
// In recording detail page client component:
const { data: recording } = trpc.recordings.get.useQuery(
  { id },
  {
    refetchInterval: (data) =>
      data?.status === 'PROCESSING' || data?.status === 'PENDING' ? 5000 : false,
  }
);
```
Stop polling automatically when status is `READY` or `FAILED`.

**Option B: Server-Sent Events (upgrade later)**
- Add `GET /api/recordings/:id/status` SSE route
- Worker publishes to Redis pub/sub on status change
- Next.js SSE route streams updates to client

**Recommendation:** Start with polling. It ships in under an hour and requires zero backend changes.

---

### P1 — Action Items Management Page (Item 12)

**Route:** `/dashboard/action-items`

**New tRPC router:** `actionItems`
- `list({ orgId, status?, assignee?, page })` — paginated list with filters
- `update({ id, status?, dueDate?, assigneeId? })` — inline edit
- `delete({ id })` — soft delete

**UI:**
- Grouped by status: Open / In Progress / Completed / Cancelled
- Filter bar: status, assignee, date range
- Inline status update (click to cycle)
- Assignee autocomplete from `OrgMember` list

---

### P1 — Settings Page (Item 13)

**Route:** `/dashboard/settings`

**Tabs:**
- **General** — org name, slug (read-only), plan info
- **Members** — list OrgMembers, invite link, remove member (admin only)
- **Note Templates** — list + CRUD for custom templates (P2 full editor)
- **API Keys** — generate/revoke ApiKey records (P3 public API)
- **Integrations** — connect Slack, Notion, Google Calendar (P2)

---

### P2 — Calendar Sync (Item 22)

**What:** Automatically pre-fill recording titles, attendees, and meeting URLs from calendar events.

**Google Calendar:**
1. OAuth scope: `https://www.googleapis.com/auth/calendar.readonly`
2. Store token in `CalendarConnection` model (encrypted)
3. Fetch upcoming events with `conferenceData` (Zoom/Meet/Teams links)
4. Show upcoming events on new `/dashboard/calendar` page
5. "Record this meeting" button → pre-fills recording form

**New schema:**
```prisma
model CalendarConnection {
  id           String           @id @default(cuid())
  orgId        String
  userId       String
  provider     CalendarProvider // GOOGLE, OUTLOOK, APPLE
  accessToken  String           // encrypted at rest
  refreshToken String           // encrypted at rest
  expiresAt    DateTime
  createdAt    DateTime         @default(now())
}

enum CalendarProvider {
  GOOGLE
  OUTLOOK
  APPLE
}
```

---

### P2 — Vector Search (Item 24)

**What:** Semantic search across all transcripts and notes.

**Option A: pgvector (recommended)**
- Add `pgvector` extension to Neon database
- Add `embedding Unsupported("vector(1536)")?` to `TranscriptSegment` and `NoteSection`
- After summarisation, generate embeddings via `openai.embeddings.create({ model: 'text-embedding-3-small' })`
- Search via cosine distance: `<=>` operator in Prisma raw query

```sql
SELECT id, text, 1 - (embedding <=> $1) AS similarity
FROM "TranscriptSegment"
WHERE "transcriptId" IN (
  SELECT id FROM "Transcript" WHERE "recordingId" IN (
    SELECT id FROM "Recording" WHERE "orgId" = $2
  )
)
ORDER BY similarity DESC
LIMIT 10;
```

**Option B: Pinecone**
- Fewer constraints, scales independently
- Additional service + cost + latency

Recommendation: Start with pgvector (no new service, lower latency). Migrate to Pinecone if query performance degrades above 10M segments.

---

### P2 — Slack Integration (Item 25)

**What:** Post meeting summary to a Slack channel automatically when notes are generated.

**Flow:**
1. Admin connects Slack in Settings → Integration OAuth flow
2. Store `access_token` encrypted in `Integration` model
3. After summarisation worker sets status = READY, publish to a `notifications` queue
4. Notification worker calls `chat.postMessage` with formatted summary

**New schema:**
```prisma
model Integration {
  id        String          @id @default(cuid())
  orgId     String
  type      IntegrationType // SLACK, NOTION, GOOGLE_CALENDAR
  config    Json            // encrypted: { accessToken, channelId, settings }
  enabled   Boolean         @default(true)
  createdAt DateTime        @default(now())
}

enum IntegrationType {
  SLACK
  NOTION
  GOOGLE_CALENDAR
  OUTLOOK_CALENDAR
}
```

**Slack message format:**
```
📝 *Meeting Notes: [Title]*
🕐 [Duration] · [Date]

*Summary*
[2-3 sentence summary]

*Action Items*
• [Owner] Task description
• [Owner] Task description

<https://app.kolasys.ai/dashboard/recordings/[id]|View full notes →>
```

---

### P2 — Notion Integration (Item 26)

**What:** Export meeting notes as a Notion page in a connected workspace.

**Flow:**
1. Connect Notion in Settings → OAuth
2. User selects target database in Settings
3. After notes generated: `pages.create` with structured blocks
4. `NoteSection` → Notion heading + paragraph blocks
5. `ActionItem` → Notion to-do blocks with checked status

---

### P2 — Public Note Sharing (Item 27)

**What:** Share a note via a public URL (no sign-in required).

**Schema additions:**
```prisma
// Add to Note model
shareToken  String?  @unique  // random 16-char hex
isPublic    Boolean  @default(false)
```

**Implementation:**
- `notes.togglePublic` mutation generates/clears `shareToken` via `crypto.randomBytes(16).toString('hex')`
- New route: `src/app/share/[token]/page.tsx` — public server-rendered view
- Public view: title, summary, action items only (no transcript, no org info)
- "Copy link" button in note detail sidebar

---

### P3 — Mobile App (Item 29)

See `docs/MOBILE_STRATEGY.md` for the complete mobile strategy document.

Summary:
- React Native + Expo
- iOS + Android feature parity
- Same tRPC API, same Clerk auth
- Background recording via foreground service
- Calendar integration
- PLAUD hardware integration (Phase 4)
- Mac menu bar app (Swift, parallel to mobile)

---

### P3 — Advanced Analytics (Item 30)

**What:** Org-level dashboards showing meeting trends.

**Metrics:**
- Meetings per week / month
- Average meeting duration
- Action item creation rate and completion rate
- Most frequent meeting attendees
- Topic trends (Claude-extracted tags stored on `Note`)

**Implementation:**
- Aggregate queries on `Recording`, `Note`, `ActionItem`
- Cache computed stats in Redis with 1-hour TTL
- `src/app/dashboard/analytics/page.tsx` with Recharts or Chart.js
- Optional: ask Claude to tag each meeting with 3–5 topic labels → store on `Note.tags` (JSON array)

---

## Migration Strategy

Phase 2 features are additive — no breaking schema changes planned. New models and field additions only.

**Schema additions in Phase 2:**
```prisma
model CalendarConnection { ... }
model Integration { ... }

// Additions to existing models:
Note {
  shareToken  String?  @unique
  isPublic    Boolean  @default(false)
  tags        String[] @default([])
}
TranscriptSegment {
  embedding   Unsupported("vector(1536)")?
}
OrgMember {
  expoPushToken  String?  // for mobile push notifications
}
```

Switch from `prisma db push` to `prisma migrate dev` before Phase 2 to establish a proper migration baseline. This enables safe schema evolution with rollback capability.
