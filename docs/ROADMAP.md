# Kolasys AI — Product Roadmap

**Last updated: April 21, 2026**

Full product vision from current state to long-term ecosystem.

---

## Phase 1 — Web App ✅ COMPLETE

**Completed:** April 4–6, 2026

- Audio ingestion (3 paths): file upload, browser recording, meeting bot (Recall.ai)
- Async pipeline: BullMQ → Whisper transcription → Claude summarisation
- Privacy: audio deleted from S3 immediately after transcription
- AI notes: executive summary, structured sections, extracted action items
- Multi-tenant: Clerk auth + organisations, all data org-scoped
- Dashboard: recordings list, recording detail, action items, settings
- Infrastructure: Neon DB, Upstash Redis, AWS S3, Vercel hosting

---

## Phase 2 — Intelligence Layer ✅ COMPLETE

**Completed:** April 6–7, 2026

- Speaker diarization — Deepgram labels who said what; users rename speakers
- Ask AI — semantic search over transcript + Claude Q&A (pgvector embeddings)
- Calendar sync — Google Calendar OAuth; upcoming meetings list
- Slack integration — auto-post formatted notes to channel
- Notion integration — auto-create Notion page from meeting notes
- Transactional email — notes-ready email (Resend), weekly digest, welcome
- Error tracking — Sentry across browser, server, and worker processes
- Product analytics — PostHog (uploads, views, completions)
- Real-time status — live processing progress on recording detail page
- Inline editing — edit note sections and action items directly in UI

---

## Phase 3 — Native Apps + UI ✅ COMPLETE

**Completed:** April 7–21, 2026

- **Railway workers deployed** — both workers online 24/7, heartbeat every 60s
- **iOS mobile app** — Expo SDK 54 + React Native New Architecture
  - Home (Feed / Tasks / Calendar tabs)
  - Record screen + S3 upload pipeline
  - Recording detail (Notes / Transcript / Actions / Ask AI)
  - Real audio player with S3 pre-signed URLs
  - Export sheet, Find & Replace, Name Speakers, Re-transcribe
  - Ask AI tab — SSE streaming
  - Dark mode — complete across all screens
  - Brand red accent #CA2625 throughout
  - Real app icon (1024×1024 RGB) + splash screen
- **Split-pane recording detail** — notes left 60%, transcript+AskAI right 40%
- **Refine Summary** — Claude Opus live (Condense / Elaborate)
- **Post-meeting email** + settings toggle
- **Analytics page** — /dashboard/analytics
- **Contacts page** — /dashboard/contacts
- **Daily Digest email** — 8 AM cron + toggle
- **Global semantic search** — across all recordings
- **Multi-language transcription** — 16 languages + auto-detect, org-level default
- **Brand identity** — real logo SVG mark, brand red #CA2625, dark mode, Geist font

---

## Phase 4 — Capture Methods + Enterprise (NEXT — This Week)

**Status:** Building now  
**Priority:** Critical — blocking enterprise sales and daily-driver adoption

### 4.1 SSO — Clerk SAML/OIDC (~1 day)
Clerk already supports SAML/OIDC SSO. Configuration unlock + Settings UI. Every competitor offers SSO at enterprise tier. Without it, enterprise deals stall at procurement.
- Add Enterprise plan gate in Settings
- Expose Clerk SSO config UI (SAML metadata URL, domain field)
- Add 'Single Sign-On' section with enable toggle
- Test with Google Workspace and Okta

### 4.2 Custom Bot Name (~1 day)
When the meeting bot joins a call, attendees see "Kolasys AI Bot". Fathom lets orgs rename this to anything — trust signal for enterprise, required for white-label.
- 'Bot display name' field in org Settings
- Pass custom name to bot join config
- Default: 'Kolasys AI' — editable per org

### 4.3 Ask Kolasys — Floating AI Chat in Recording (~3 days)
Granola has "Ask Granola", Fireflies has "AskFred". The AskAI tab exists — upgrade to a floating chat panel grounded in the current recording's transcript. Works during playback.
- Floating panel on recording detail page (not a tab — always accessible)
- Strictly grounded in current recording's transcript
- SSE streaming via Claude (already implemented in mobile)
- Suggested prompts on first open
- "What did we decide?", "List action items", "Summarize last 10 minutes"

### 4.4 Bot-free Desktop Capture + Bot Capture (~2 weeks)
Granola ($1.5B) built their entire company on bot-free. Fathom offers both. Google Meet flags bots as security risks. Kolasys needs both options.
- **Mac desktop app** — Electron or Tauri menu bar app
  - Detects Zoom/Teams/Meet from calendar
  - Auto-starts recording on call start
  - Captures system audio — no bot participant visible
  - Uploads to existing S3 → transcription → summarization pipeline
- **Bot mode** — Chrome extension or Zoom SDK bot
  - Joins meeting as participant
  - For remote capture when desktop app isn't running
- New Recording modal: 'Capture type' selector — Bot / Desktop / Upload / In-person

---

## Phase 5 — Growth + Differentiation (Next 30 Days)

### 5.1 Apple Watch App — Phase 1 (~1 week)
No competitor has a WatchOS app. Plaud sells $179 hardware for what a watch can do.
- SwiftUI WatchOS target in the Expo project
- WatchConnectivity framework (iPhone ↔ Watch)
- Tap Digital Crown: start/stop recording on iPhone from wrist
- Live recording timer on watch face
- Waveform animation while recording
- Haptic confirmation on start/stop
- **Phase 2:** notification when notes ready + 3-bullet summary on wrist
- **Phase 3:** Force Touch to bookmark a moment (creates transcript timestamp)

### 5.2 Free Tier + Public Pricing (~1 day)
Fathom acquires users with unlimited free recordings. Granola gives 25 free meetings. Kolasys has no public pricing — invisible to individuals.
- **Free:** 300 min/month transcription, 5 AI summaries/month, 1 org
- **Pro:** $12/month — unlimited transcription, unlimited AI, all features
- **Team:** $10/seat/month (min 2) — shared workspace, admin, analytics
- **Enterprise:** custom — SSO, HIPAA, custom data retention, dedicated support
- No AI credits — flat rate, everything included (beats Fireflies' #1 complaint)
- Public /pricing page on marketing site

### 5.3 Mobile Parity — Contacts, Analytics, Soundbites (~1 week)
Fireflies mobile has emoji-bullet AI summaries, assignee avatars, Soundbites. Kolasys mobile needs these screens.
- Contacts screen — mirror web /dashboard/contacts (tRPC API already exists)
- Analytics screen — mirror web /dashboard/analytics
- Soundbites — clip highlights from recording with timestamp range selector
- Polish home feed — Fireflies-style emoji-categorized summary bullets
- Assignee avatars on action items in Tasks tab

### 5.4 Word-level Audio Sync (~1 week)
Click any word in the transcript → audio player jumps to that exact timestamp. Otter.ai and Fireflies both have this.
- Whisper already returns word-level timestamps — store them in DB
- Render transcript as clickable word spans
- On word click: seek audio player to word.start timestamp
- Highlight current word as audio plays
- Works on web split-pane and mobile RecordingDetailScreen

---

## Phase 6 — Enterprise Ecosystem (Next 60 Days)

### 6.1 CRM Integration — HubSpot + Salesforce (~1 week)
Auto-push meeting summaries and action items to CRM contact/deal records. Unlocks sales team market.
- OAuth integration with HubSpot + Salesforce
- After meeting: push summary + action items to matched contact/deal
- Settings: map Kolasys fields to CRM fields
- Integrations page: replace 'Coming Soon' with live connectors

### 6.2 API Keys Page (~2 days)
Granola launched personal API + enterprise API at Series C. Developers want to build on Kolasys.
- Generate + display API keys in Settings > Developer
- REST API: GET /recordings, GET /recordings/:id/transcript, GET /recordings/:id/actions
- Webhooks: on_recording_ready, on_transcription_complete, on_summary_ready
- API key revocation and rotation

### 6.3 Topic Tracker (~2 days)
Fireflies highlights keyword categories (competitor names, pricing objections) across all transcripts.
- Settings: define keyword lists
- Transcript view: highlight matched keywords with colored underlines
- Filter recordings by topic match

### 6.4 Compliance Notification (~1 day)
Required for HIPAA, legal, enterprise deals.
- Enable/disable compliance notification per org
- Custom message field
- When bot joins: send notification to meeting chat automatically

### 6.5 Shareable Highlight Clips / Soundbites (~1 week)
Fireflies Soundbites lets users clip specific moments and share via public link.
- Select start/end timestamp on transcript or audio player
- Generate clip: trim audio, attach transcript excerpt
- Share via public link (no login required for viewer)
- Soundbites library in sidebar (web + mobile)

### 6.6 Real-Time Transcription During Meetings (~2 weeks)
Zoom AI, Granola, Fireflies, Read.ai all show live captions. Requires desktop app or bot (Phase 4) as prerequisite.
- Stream audio chunks to Whisper every 3-5 seconds
- Push partial transcript via WebSocket / SSE
- Show live transcript panel during active recording
- Late-joiner catch-up: "Show last 5 minutes"

---

## Competitive Context (April 21, 2026)

| Competitor | Valuation | Key Strength | Kolasys Advantage |
|---|---|---|---|
| Granola | $1.5B (Series C Mar 2026) | Bot-free desktop, Mac+Windows | More languages (16 vs 10), Apple Watch planned |
| Fireflies.ai | $1B | 100+ languages, soundbites, CRM, mobile | No hidden AI credits, Claude-powered |
| Fathom | Private | Unlimited free tier, bot+bot-free, no AI credits | Claude-powered, Apple Watch planned |
| Read.ai | Private | Real-time engagement + sentiment, knowledge graph | Simpler, no meeting friction |
| Zoom AI 3.0 | Public ($ZOOM) | Live transcription, Ask AI mid-call, bundled | Cross-platform, any meeting tool |
| Plaud | Hardware startup | Offline wearable recorder, 112 languages | No $159 hardware cost, Apple Watch |

**Kolasys unique advantages — no competitor matches all four:**
1. Claude-powered natively (not GPT-only — Granola only via MCP)
2. No AI credits / transparent flat-rate pricing (Fireflies' #1 complaint)
3. Apple Watch app planned — no competitor has any wristOS integration
4. Multi-language at upload time (16 languages, org-level default)

---

## Prioritisation Framework

| Priority | When | Criteria |
|---|---|---|
| P0 | Now | Blocks enterprise deals or daily-driver adoption |
| P1 | Next 30 days | Reaches feature parity with top competitor |
| P2 | Next 60 days | Differentiating features that drive retention |
| P3 | After PMF | Growth, scale, advanced enterprise |
