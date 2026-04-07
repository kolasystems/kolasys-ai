# Kolasys AI — Product Roadmap

Full product vision from current state to long-term ecosystem.

---

## Phase 1 — Web App ✅ COMPLETE

**Status:** Complete and deployed at https://app.kolasys.ai  
**Completed:** April 4, 2026 (first pipeline test), April 6, 2026 (deployed)

### What was built

- **Audio ingestion (3 paths):**
  - File upload (drag-and-drop, direct-to-S3)
  - Browser recording (MediaRecorder API)
  - Meeting bot (Recall.ai — Zoom, Google Meet, Microsoft Teams)
- **Async pipeline:** BullMQ → Whisper transcription → Claude summarisation
- **Privacy:** Audio deleted from S3 immediately after transcription
- **AI notes:** Executive summary, structured sections, extracted action items
- **Multi-tenant:** Clerk auth + organisations, all data org-scoped
- **Dashboard:** Recordings list, recording detail, action items, settings
- **Infrastructure:** Neon DB, Upstash Redis, AWS S3, Vercel hosting

---

## Phase 2 — Intelligence Layer ✅ COMPLETE

**Status:** Complete  
**Completed:** April 6, 2026

### What was built

- **Speaker diarization** — Deepgram labels who said what; users rename speakers
- **Ask AI** — semantic search over transcript + Claude Q&A (pgvector embeddings)
- **Calendar sync** — Google Calendar OAuth; upcoming meetings list; pre-fill recording
- **Slack integration** — auto-post formatted notes to channel after every meeting
- **Notion integration** — auto-create Notion page from meeting notes
- **Transactional email** — notes-ready email (Resend), weekly digest, welcome
- **Error tracking** — Sentry across browser, server, and worker processes
- **Product analytics** — PostHog (uploads, views, completions)
- **Real-time status** — live processing progress on recording detail page
- **Inline editing** — edit note sections and action items directly in UI
- **Paginated transcript** — speaker-labelled, paginated transcript viewer

---

## Phase 3 — Worker Infrastructure + Native Apps (NEXT)

**Status:** In progress / planned  
**Priority items:**

### 3.1 — Worker Deployment (P0 for production)

Workers currently only run locally. Production pipeline is blocked until workers are deployed.

- **Target:** Railway or Fly.io
- **What:** Two long-running Docker containers (`transcription.worker.ts`, `summarization.worker.ts`)
- **Why:** Vercel only supports serverless functions — workers need persistent processes
- See `docs/DEPLOYMENT.md` §4 for implementation guide

### 3.2 — Auth Hardening

- Full Clerk org webhook integration (production URL, not ngrok)
- Google Calendar OAuth token refresh handling
- Microsoft Calendar OAuth (Outlook)
- Rate limiting on upload + bot deploy endpoints (Upstash Ratelimit)
- Whisper 25 MB file size limit — reject at upload with clear error UI

### 3.3 — iOS App

- React Native + Expo
- Features: record meetings, view notes, manage action items, Ask AI
- Same tRPC API, same Clerk auth
- Background recording via iOS foreground service
- Calendar integration (EventKit)
- Push notifications (Expo Notifications)
- **Status:** Pending Apple Developer account approval

### 3.4 — Android App

- React Native + Expo (shared codebase with iOS)
- Same feature set as iOS
- Background recording via Android foreground service
- **Status:** Not yet started; requires Google Play developer account ($25)

### 3.5 — Remaining Phase 2 items

- Error state + retry UI on failed recordings
- Empty state + onboarding UI for new users
- Custom note templates CRUD UI
- Public note sharing (`/share/[token]` route)
- ProcessingJob audit log visible in recording detail
- Real-time transcription (Deepgram streaming WebSocket)

---

## Phase 4 — Desktop Apps

**Status:** Future  

### 4.1 — Mac Menu Bar App

- Swift + SwiftUI + MenuBarExtra
- One-click record from any Mac app
- Automatic upload on stop
- Notifications when notes are ready
- Keyboard shortcut: record / stop
- Reads from `app.kolasys.ai` API (same tRPC, new Swift client)

### 4.2 — Windows App

- Electron or Tauri
- Same feature set as Mac menu bar app
- Windows system tray integration

### 4.3 — PLAUD NotePin Hardware Integration

- PLAUD NotePin: hardware AI recorder (credit-card sized)
- PLAUD exports audio via their app
- Phase 4: watch a folder / import from PLAUD app
- Phase 5: direct API integration with PLAUD platform

---

## Phase 5 — Enterprise Ecosystem

**Status:** Long-term  

### 5.1 — CRM Sync

- Salesforce: sync action items as Tasks; link recordings to Contact/Opportunity
- HubSpot: same model
- OAuth flow in Settings → Integrations
- Mapping: assignee name → CRM contact lookup

### 5.2 — Public API

- REST API with API key auth (ApiKey model already in schema)
- Endpoints: list recordings, get transcript, get notes, create recording
- Webhook delivery: notify external systems when notes ready
- SDK: TypeScript, Python

### 5.3 — Analytics Dashboard

- Meeting trends: frequency, duration, attendees
- Action item completion rates
- Topic trends (Claude-extracted tags)
- Team-level reporting for managers
- Exportable to CSV/PDF

### 5.4 — White Labeling

- Custom domain support (e.g. `meetings.company.com`)
- Custom branding: logo, colors
- Custom email domain
- For enterprise resellers

### 5.5 — Enterprise Features

- SSO (SAML) via Clerk
- Audit logs (all data access logged)
- Data residency (EU region option)
- HIPAA compliance mode (BAA available)
- Custom data retention policies
- Bulk export (recordings + notes + transcripts)
- Admin panel: user management, usage reporting

---

## Prioritisation Framework

| Priority | When | Criteria |
|---|---|---|
| P0 | Now | Blocks launch or creates data integrity / security issues |
| P1 | Before first paying users | Core UX without it is broken or embarrassing |
| P2 | After 100 users | Differentiating features that drive retention |
| P3 | After product-market fit | Growth, scale, enterprise |

---

## Competitive Context

| Product | Their strength | Our differentiation |
|---|---|---|
| Granola AI | Desktop-first, great UX | Web + mobile + hardware; team/org features |
| Fireflies | Team features, large library | Better AI notes quality; Notion/Slack-first integrations |
| Otter.ai | Mature transcription | Modern stack; structured AI output vs raw text |
| Notion AI | Embedded in Notion | Standalone; works for any meeting tool |
| PLAUD | Hardware recorder | Software + hardware; AI pipeline vs just transcription |

**Kolasys AI's angle:** The invisible AI meeting assistant. No bot needed for in-person meetings. Hardware integration path. Developer-friendly (public API). Privacy-first (audio deleted by default).
