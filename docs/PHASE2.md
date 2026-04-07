# Kolasys AI — Phase 2: Full Roadmap & Audit List

Phase 2 transforms Kolasys AI from a functional recording pipeline into a full meeting intelligence platform.

This document is the **definitive roadmap** — it includes the complete 30-item audit list (P0 → P3) generated in Session 3, plus the original Phase 2 feature descriptions.

---

## 30-Item Audit List

Audited 2026-04-06. Items are ordered within each priority tier by implementation dependency.

---

### P0 — Must Fix Before Sharing With Anyone

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

| # | Item | Status | Notes |
|---|---|---|---|
| 11 | Real-time processing status on recording detail page | ✅ Done | `recording-status-poller.tsx` polls every 5s while PROCESSING |
| 12 | Action items management page (`/dashboard/action-items`) | ✅ Done | List, filter by status, inline update |
| 13 | Settings page (`/dashboard/settings`) | ✅ Done | Org name, plan, note templates, integrations tab |
| 14 | Error state on recording detail (status = FAILED) | ⬜ Todo | Show error message + retry button |
| 15 | Whisper 25 MB file size limit handling | ⬜ Todo | Reject at upload with clear error message |
| 16 | Worker deployment to Railway/Fly.io | ⬜ Todo | **Blocking production pipeline** — see `docs/DEPLOYMENT.md` §4 |
| 17 | Clerk webhook org sync configured in production | ⬜ Todo | Auto-provisioning is a workaround; webhook is authoritative |
| 18 | Empty state UI for new orgs with no recordings | ⬜ Todo | Show onboarding prompt instead of empty list |
| 19 | `ProcessingJob` audit log visible in UI | ⬜ Todo | Job history on recording detail for debugging |
| 20 | Rate limiting on tRPC mutations | ⬜ Todo | Prevent abuse of upload + bot deploy endpoints |

---

### P2 — Platform Features — After First Public Users

| # | Item | Status | Notes |
|---|---|---|---|
| 21 | Custom org note templates UI | ⬜ Todo | CRUD UI for NoteTemplate — schema already has it |
| 22 | Calendar sync (Google Calendar + Outlook) | ✅ Done | Google OAuth + upcoming meetings list + pre-fill recording modal |
| 23 | Real-time transcription (live captions) | ⬜ Todo | Deepgram streaming WebSocket |
| 24 | Vector search across transcripts + notes | ✅ Done | `text-embedding-3-small` embeddings + Ask AI panel |
| 25 | Slack integration — post summary after meeting | ✅ Done | Incoming webhook + formatted blocks in summarisation worker |
| 26 | Notion integration — export notes as page | ✅ Done | Notion API page creation with blocks |
| 27 | Public note sharing via share token | ⬜ Todo | `Note.shareToken` + `/share/[token]` route |
| 28 | Email digest — weekly meeting summary | ✅ Done | Resend + Vercel cron every Monday |

---

### P3 — Growth & Scale

| # | Item | Status | Notes |
|---|---|---|---|
| 29 | Mobile app (React Native + Expo) | ⬜ Todo | See `docs/MOBILE_STRATEGY.md` |
| 30 | Advanced analytics dashboard | ⬜ Todo | Meeting trends, action item completion rate |

---

## Phase 2 Feature Specifications

---

### P1 — Real-Time Processing Status (Item 11) ✅

**Implemented:** `src/components/recording-status-poller.tsx`

Uses TanStack Query's `refetchInterval`:
```typescript
const { data: recording } = trpc.recordings.get.useQuery(
  { id },
  {
    refetchInterval: (data) =>
      data?.status === 'PROCESSING' || data?.status === 'PENDING'
      || data?.status === 'TRANSCRIBING' || data?.status === 'SUMMARIZING'
        ? 5000
        : false,
  }
);
```
Polling stops automatically when status is `READY` or `FAILED`.

---

### P1 — Action Items Page (Item 12) ✅

**Route:** `/dashboard/action-items`

Features:
- Grouped by status: Open / In Progress / Completed / Cancelled
- Filter bar: status, date range
- Inline status/priority edit via `editable-action-item.tsx`
- Org-scoped (all action items across all recordings)

---

### P1 — Settings Page (Item 13) ✅

**Route:** `/dashboard/settings`

Tabs:
- **General** — org name, plan info
- **Integrations** — Slack webhook URL, Notion API key + database ID, Google Calendar connect
- **Note Templates** — list built-in + org templates (CRUD UI in progress)

---

### P1 — Worker Deployment (Item 16) ⬜ BLOCKING

> This is the highest-priority remaining item. Without deployed workers, the production pipeline doesn't work.

See `docs/DEPLOYMENT.md` §4 for the Railway/Fly.io setup guide.

---

### P2 — Calendar Sync (Item 22) ✅

**Implemented:**
- `src/app/api/auth/google/` — Google OAuth flow (scope: `calendar.readonly`)
- `OrgMember.googleRefreshToken` stores the refresh token
- `calendar-meetings-list.tsx` — lists upcoming events with conferenceData (Zoom/Meet/Teams links)
- `/dashboard/calendar` page
- "Record this meeting" button pre-fills recording title + meeting URL

**New schema additions:**
- `OrgMember.googleRefreshToken String?`

---

### P2 — Vector Search / Ask AI (Item 24) ✅

**Implemented:**
- `src/services/embeddings.service.ts` — chunks transcript into ~500-char pieces, generates `text-embedding-3-small` embeddings
- `src/lib/db-vector.ts` — pgvector cosine similarity helpers
- `src/app/api/ai/ask/route.ts` — vector search → context assembly → Claude answer
- `ask-ai-panel.tsx` — Q&A sidebar on recording detail
- `src/hooks/use-ai-chat.ts` — streaming response hook

**Phase 3 upgrade path:** Switch to pgvector on Neon when segment volume exceeds 1M. Or Pinecone if cross-recording search at scale is needed.

---

### P2 — Slack Integration (Item 25) ✅

**Implemented:**
- `src/services/integrations/slack.service.ts`
- `Organization.slackWebhookUrl` field stores the incoming webhook URL
- Summarisation worker calls Slack after notes are saved (non-fatal)
- Message format: header, summary callout, action items list, "View Full Notes" link button

**Slack message blocks format:**
```
📝 Meeting Notes: [Title]
🕐 [Duration] · [Date]

[Executive summary]

Action Items:
• [Owner]: Task title
• [Owner]: Task title

[View Full Notes →]
```

---

### P2 — Notion Integration (Item 26) ✅

**Implemented:**
- `src/services/integrations/notion.service.ts`
- `Organization.notionApiKey` + `Organization.notionDatabaseId` fields
- Summarisation worker creates Notion page after notes saved (non-fatal)
- Page structure: blue callout summary, heading_2 per section, paragraphs, to-do action items, link back

**Notion API limits:** Paragraphs must be split at 2000 characters (Notion block limit). Service handles this automatically.

---

### P2 — Weekly Email Digest (Item 28) ✅

**Implemented:**
- `src/emails/weekly-digest.tsx` — meeting recap email template
- `src/app/api/cron/weekly-digest/route.ts` — Vercel cron endpoint
- `vercel.json` — cron schedule: every Monday 9:00 AM UTC
- Sends via Resend

---

### P3 — Mobile App (Item 29) ⬜

See `docs/MOBILE_STRATEGY.md` for the complete mobile strategy.

Summary:
- React Native + Expo
- iOS + Android feature parity
- Same tRPC API, same Clerk auth
- Background recording via foreground service
- Calendar integration
- PLAUD hardware integration (Phase 4)
- Mac menu bar app (Swift, parallel to mobile)

---

### P3 — Advanced Analytics (Item 30) ⬜

**Planned:**
- Aggregate queries on `Recording`, `Note`, `ActionItem`
- Metrics: meetings/week, avg duration, action item completion rate, topic trends
- Cache in Redis (1h TTL)
- `src/app/dashboard/analytics/page.tsx`
- Optional: Claude-extracted topic tags on `Note.tags` JSON array

---

## Migration Strategy

Phase 2 additions are complete. All changes were additive (no breaking schema changes).

**Schema additions made in Phase 2:**
```prisma
model SpeakerLabel {
  id          String    @id @default(cuid())
  recordingId String
  speakerId   String    // "SPEAKER_0", "SPEAKER_1", etc.
  displayName String    // user-provided name
  createdAt   DateTime  @default(now())
}

// Additions to existing models:
Organization {
  slackWebhookUrl    String?
  notionApiKey       String?
  notionDatabaseId   String?
}
OrgMember {
  googleRefreshToken String?
}
Recording {
  // RecordingStatus enum now includes TRANSCRIBING, SUMMARIZING
}
```

**Phase 3 schema additions (planned):**
```prisma
model CalendarConnection { ... }  // full calendar OAuth token storage

// Additions:
Note {
  shareToken  String?  @unique
  isPublic    Boolean  @default(false)
  tags        String[] @default([])
}
TranscriptSegment {
  embedding   Unsupported("vector(1536)")?  // pgvector
}
OrgMember {
  expoPushToken  String?  // mobile push notifications
}
```

Switch from `prisma db push` to `prisma migrate dev` before Phase 3 to establish a proper migration baseline with rollback capability.
