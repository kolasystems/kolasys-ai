# Kolasys AI — Product Status & Pipeline
**Updated:** May 29, 2026 | Confidential

---

## Product Overview

Kolasys AI is a Claude-powered meeting intelligence platform. Users record or upload meetings, and the platform transcribes, summarizes, and surfaces action items. Available on web, iOS, Apple Watch, and Mac desktop.

**Live URLs:**
- Web app: https://app.kolasys.ai
- Marketing site: kolasys.ai (redesign in progress)

---

## What's Built — Current State

### Web App (app.kolasys.ai)
Deployed on Vercel. Three Railway workers online 24/7.
Stack: Next.js 16.2 + Prisma 7 + tRPC 11 + Clerk 7 + Neon (PostgreSQL) + Upstash Redis + S3

**Core Features:**
- Split-pane recording detail (notes left 60%, transcript+AI right 40%)
- Markdown rendering (react-markdown + remark-gfm)
- Refine Summary (Condense / Elaborate) — calls Claude Opus live
- AI-generated meeting titles with date prefix
- Edit meeting title inline + Regenerate Title
- Speaker renaming — propagates to action items
- Retry stuck transcription button (>10 min threshold)
- Shareable recording links — public `/share/{slug}` (no auth, no audio)
- Soundbites — select transcript text → clip → Soundbites tab + `/dashboard/soundbites`
- Post-meeting email after transcription + settings toggle
- Onboarding email on signup (Clerk webhook → Resend)
- Daily Digest email (8 AM cron) + settings toggle
- Global semantic search across recordings
- Multi-language transcription — 16 languages + auto-detect
- Analytics / Conversation Intelligence page
- Contacts page (auto-extracted from meetings)
- Knowledge Base page
- Ask AI (global + per-recording) with ?q= prefill support
- Templates + AI Skills
- Calendar integration (Google + Microsoft OAuth)
- Dark mode (pre-hydration script, no flash)
- Trial expiry banner (yellow ≤7 days, red expired)
- Web push notifications (VAPID, service worker)
- Upload audio or Voice Memo button
- Admin portal (/admin) — org management, suspend, trial controls
- SSO — Clerk SAML/OIDC, Enterprise plan gate
- Custom bot name — editable in Settings
- Word-level audio sync — click transcript word → seeks audio
- Public pricing page at /pricing
- API Keys — generate/revoke keys, REST v1 endpoints
- **AI Meeting Series** — auto-detects recurring meetings, groups into series
  - SeriesNavSection in sidebar
  - `/dashboard/series/[id]` detail page with inline-editable title
  - Detection runs after every summarization (step 8.45)
- **Auto-record meetings toggle** — Settings, defaults ON

**Navigation:** Overview → Meetings → Action Items → Analytics → Contacts → Knowledge → Ask AI → Soundbites → Calendar → Templates → Settings → Billing → Integrations

### iOS App (Build 22 — TestFlight | Build 23 pending)
Stack: Expo SDK 54 + React Native New Architecture
Bundle ID: com.kolasystems.kolasysai | Apple Team: G4FYFLNJMC

**Features:**
- Home screen — greeting, round record button, quick-action cards
- Trial expiry banner → Billing
- Meetings list with search + semantic results
- Recording detail — Notes / Transcript / Actions / Ask AI / Personal tabs
- Real audio player with S3 pre-signed URLs
- Refine Summary (Condense / Elaborate) + Undo
- Word-level audio sync
- Edit/Regenerate title, Delete recording
- Find & Replace in transcript
- Name speakers, Re-transcribe
- Action Items screen with priority filters
- Knowledge Base screen
- Ask AI screen with streaming
- Templates screen
- Analytics screen
- Contacts screen
- Dark mode (ThemeContext, all screens)
- Settings — Profile, Subscription, Organization, Appearance
- Billing screen — Stripe checkout
- iOS Share Extension — Voice Memos, Fireflies, Plaud, any audio
- Apple Watch app (Phase 1) — mic button, timer, WatchConnectivity
- **Series screen + SeriesDetailScreen** (Build 23)
- **Microsoft sign-in** (Build 23 — Azure iOS platform added)

**Bottom Nav:** Home | Meetings | Ask AI | Tasks | Settings

### Mac Desktop App (kolasys-ai-desktop)
Stack: Electron 41, menu bar app, no dock icon

**Features:**
- Warm off-white main window (#F5F3EE) — Granola-style
- Sidebar: Meetings, Upcoming, Series, Record, Send Bot
- Meetings list with Today/Yesterday/This Week grouping
- Meeting detail page:
  - Section cards with Edit-on-hover + inline editing
  - Audio player
  - AI Insights panel (Follow-up questions, Risks, Commitments, Sentiment)
  - People & Topics pills
  - Checkable action items (synced to server)
  - **Share modal** — Granola-style, Anyone/Private toggle, Copy link
  - **Templates dropdown** — org templates, All templates link
- **Series sidebar nav + detail view** (inline-editable, Ask AI)
- Pre-meeting page — prep notes + "Meeting starting soon" banner
- **Floating overlay** (frosted glass, always-on-top):
  - Notes tab (default) — types notes saved on recording stop
  - Transcript tab — Pro-gated, Deepgram real-time streaming
  - Live transcript: ~300ms latency (Pro), Whisper batch fallback (Free)
- OAuth sign-in via browser → `kolasys://` protocol
- Calendar auto-detection (Google + Microsoft, 48h window)
- Tray menu with upcoming meetings
- Start Recording button + Send Bot button
- Light/dark themes

### Apple Watch (Phase 1 + 2)
- Tap Digital Crown → start/stop recording on iPhone
- Live recording timer + WatchConnectivity bridge
- Push notification when notes ready + 3-bullet summary

### Infrastructure
- **Railway:** glorious-serenity, 3 workers, US East/West, always-on
  - `kolasys-ai` — transcription worker
  - `summarization-worker` — summarization + push + series detection
  - `calendar-bot-worker` — auto-deploys bots to calendar meetings (**NEW**)
- **Vercel:** auto-deploys on push to main, team_zi1n0EiTtWQtsbtmgowsPIHU
- **Neon PostgreSQL:** ep-solitary-block-a4lkssj4
- **Upstash Redis:** shared queue for workers
- **S3:** audio files + pre-signed playback URLs
- **Clerk:** auth (test keys local, live keys production)
- **Resend:** transactional email
- **Stripe:** billing
- **Anthropic:** Claude Opus (summarization + Refine), Claude Haiku (title generation)
- **Deepgram:** live transcription (desktop Pro overlay)
- **Recall.ai:** bot capture (manual Send Bot + auto-calendar bot)

---

## Billing & Plans

| Plan | Price | Stripe Price ID |
|------|-------|----------------|
| Pro Monthly | $9.99/mo | price_1TReH9CSoXibpWfNkXad6PaK |
| Pro Yearly | $99/yr | price_1TReKGCSoXibpWfNx6C1HT1T |
| Team Monthly | $8.99/seat/mo | price_1TReOnCSoXibpWfNUod8NeTK |

**Enforcement:**
- FREE + no active trial: 3 recordings/month cap
- Suspended orgs: all tRPC mutations + REST API blocked
- Deepgram live transcription: Pro/Team/Enterprise only

---

## Current Users (as of May 29, 2026)

| Org | Joined | Status | Notes |
|-----|--------|--------|-------|
| Kola Systems (prod) | Apr 8 | Active | paul@kolasystems.com |
| Kola Systems (dev) | Apr 6 | Active | Dev/test org |
| Blended By Grace | Apr 28 | No recordings | Needs outreach |
| New Hope Housng | Apr 28 | No recordings | Needs outreach |

---

## Competitive Position (May 29, 2026)

| Feature | Granola | Fireflies | Fathom | Kolasys |
|---------|---------|-----------|--------|---------|
| Bot capture | ✗ | ✓ | ✓ | ✓ (Recall.ai) |
| Auto-join calendar | ✓ | ✓ | ✓ | ✓ NEW |
| Bot-free desktop | ✓ | ✗ | ✓ | Planned |
| AI-native (Claude) | via MCP | ✗ GPT | ✗ GPT | ✓ Native |
| Apple Watch | ✗ | ✗ | ✗ | ✓ Phase 1+2 |
| Voice Memos share | ✗ | ✓ | ✗ | ✓ |
| Soundbites | ✗ | ✓ | ✓ | ✓ |
| Live transcript overlay | ✓ | ✓ | ✗ | ✓ NEW (Pro) |
| Meeting series / folders | ✓ | ✗ | ✓ | ✓ NEW |
| Real-time live transcript | ✓ | ✓ | ✗ | ✓ Pro (Deepgram) |
| Share modal | ✓ | ✓ | ✓ | ✓ NEW |
| Multi-language | 10 only | 100+ | limited | 16 |
| No AI credits | ✓ | ✗ | ✓ | ✓ |
| Marketing site | ✓ | ✓ | ✓ | Redesign in progress |

---

## Build Pipeline — Priority Queue

### 🔴 Critical (This Week)

**1. Build 23 — TestFlight**
Archive from `~/Desktop/kolasys-ai-mobile` in Xcode:
- Product → Archive → Distribute → App Store Connect → Upload
- Includes: Series screens, Microsoft OAuth fix, personal notes debug fix
- Fix personal notes save before archiving (check PATCH URL + auth)

**2. Marketing site redesign**
kolasys.ai needs full redesign — prompt sent to Terminal 3.
- Dark hero, platform section, features grid, pricing, social proof, footer
- Deploy to Vercel under kolasys.ai domain

**3. Outreach to real users**
Blended By Grace + New Hope Housng — joined April 28, still zero recordings.
- Personal email from Paul with walkthrough

### 🟠 High (Next 2 Weeks)

**4. Manual folder creation**
Same `MeetingSeries` model (`autoDetected: false`). Needs:
- Web: "+ Add folder" button in sidebar → modal → create
- Desktop: "+ Add folder" in sidebar Series section
- Mobile: New folder button on Series screen
- REST: `POST /api/v1/series` (create), `POST /api/v1/series/{id}/recordings` (add), `DELETE /api/v1/series/{id}/recordings/{recordingId}` (remove)
- "Add to folder" option on meeting rows (web + desktop + mobile)

**5. Series detection threshold improvement**
In `src/services/series-detection.service.ts`:
- Lower threshold: 0.5 → 0.3
- First-word boost: if first meaningful word matches, add 0.2 to score

**6. Share workflow upgrade (Plaud-style)**
Current share is basic. Needs:
- Share with Link: permissions (Audio/Transcript/Summary), expiry (7d/14d/30d/never)
- Invite tab: add email addresses, only invited people access
- Web + iOS

**7. Billing dunning**
`invoice.payment_failed` just logs. Should:
- Send warning email via Resend
- Auto-suspend after 3 failures
- Recovery email when payment succeeds

### 🟡 Medium (Next 30 Days)

**8. Android app**
Expo handles ~90%. Needs build + testing + Google Play.

**9. Apple Watch Phase 3**
Force Touch to bookmark a transcript moment (creates timestamp).

**10. CRM integration**
HubSpot + Salesforce auto-push after meeting completes.

**11. Soundbites — mobile parity**
Web has Soundbites. Mobile needs Soundbites screen + create from transcript.

**12. Topic tracker**
Keyword highlighting across transcripts. Settings → define lists → colored underlines.

**13. Compliance notification**
Notify participants with custom message when bot joins (HIPAA/enterprise).

**14. Webhooks**
`on_recording_ready`, `on_transcription_complete`, `on_summary_ready`.

**15. Desktop code sign + DMG**
electron-builder, Developer ID cert, notarization for distribution.

### Blocked

| Feature | Blocker |
|---------|---------|
| Upload audio on mobile | Expo SDK 54 + Xcode 16 SwiftUICore crash — revisit SDK 55 |

---

## Technical Reference

### Repository Structure
| Repo | Location | Deploy |
|------|----------|--------|
| Web | ~/Desktop/kolasys-ai | Vercel auto on main push |
| Mobile | ~/Desktop/kolasys-ai-mobile | Xcode archive → TestFlight |
| Desktop | ~/Desktop/kolasys-ai-desktop | Local / DMG (pending) |

### Critical Rules
```
Clerk keys:    Local = pk_test_ + sk_test_. Railway + Vercel = pk_live_ + sk_live_. NEVER mix.
Prisma v7:     No $transaction. No nested creates. Sequential calls. db push for schema changes.
Mobile:        npm install --legacy-peer-deps always.
Mobile tRPC:   batch POST format {"0":{json:input}}
Build:         feat/* → test → merge to main → Vercel auto-deploys
EAS:           ALWAYS fails — use Xcode archive for TestFlight
objectVersion: After any Xcode target: sed -i '' 's/objectVersion = 70/objectVersion = 60/' ios/KolasysAI.xcodeproj/project.pbxproj
Share Ext:     Pure UIKit only. iOS 15.6 min. Copy file inside callback.
BlurView:      NEVER use in mobile — transparent on iOS Simulator. Use View with backgroundColor.
Web tRPC root: src/server/root.ts (not index.ts)
Desktop WS:    const WebSocket = require('ws') — ws@8.21.0 installed
```

### Brand
```
Brand Red:    #CA2625
Error Red:    #EF4444 (never mix with brand red)
Dark bg:      #0F0F13
Dark surface: #1A1A24
Dark border:  rgba(255,255,255,0.08)
Font (web):   Geist (npm, bundled)
Desktop bg:   #F5F3EE (warm off-white, Granola-inspired)
```

### App Identifiers
```
iPhone:          com.kolasystems.kolasysai        App ID: 6764396351
Watch:           com.kolasystems.kolasysai.watchkitapp
Share Extension: com.kolasystems.kolasysai.KolasysShare
Desktop:         com.kolasystems.kolasysai.desktop
App Group:       group.com.kolasystems.kolasysai
Apple Team ID:   G4FYFLNJMC
```

### Vercel + Railway IDs
```
Vercel team:          team_zi1n0EiTtWQtsbtmgowsPIHU
Vercel project:       prj_zRULmKRBOart7IwwzAl41buIyqxB
Railway project:      b29c2446-507a-4f4e-a4a9-ce0872541a15 (glorious-serenity)
Railway kolasys-ai:   (transcription worker)
Railway summ-worker:  22ddb72d-8f94-4023-ae09-456d1f6b2e10
Railway cal-worker:   049425d8-63cf-422e-98a6-3ce3b30de9ec  ← NEW
Railway region:       US East (Virginia) for kolasys-ai + summarization; US West for calendar-bot
```

### Azure (Microsoft OAuth)
```
App ID:         c4303954-8d4e-4b6d-9eb3-8adb51d9d303
Client Secret:  6a72c69f-9fc1-4bb9-a309-9b367bde6cb6 (expires 5/17/2028)
iOS Platform:   com.kolasystems.kolasysai → msauth.com.kolasystems.kolasysai://auth  ← ADDED MAY 29
Web redirects:  https://app.kolasys.ai/api/auth/microsoft/callback
                https://clerk.app.kolasys.ai/v1/oauth_callback
```

### VAPID Keys (Web Push)
```
Public:  BFe9N-R1b2j0aPQ7Nn_8BkaYUIYdPi7N4S0p9rKP-PKO376EMXk9Y1_OxzH39byUOoiqLXVRi0_iEpXe-GElzc8
Private: Yrger5zLkmYkgK6RlzR61YFgCIRWqw8AU7lKBRC_lNs
Subject: mailto:hi@kolasys.ai
```

### Stripe Price IDs
```
Pro Monthly:  price_1TReH9CSoXibpWfNkXad6PaK
Pro Yearly:   price_1TReKGCSoXibpWfNx6C1HT1T
Team Monthly: price_1TReOnCSoXibpWfNUod8NeTK (per seat)
```

### Key Git Commits (May 29, 2026)
| Hash | Repo | Description |
|------|------|-------------|
| `a7ca402` | desktop | fix: overlay frosted glass transparency, faster transcript chunks |
| `07b134d` | desktop | fix: overlay vibrancy hud + save overlay notes on recording stop |
| `ce0b17f` | desktop | feat: Deepgram WebSocket real-time transcription for overlay |
| `d2951c2` | desktop | feat: notes-first overlay, live transcript gated on Pro plan |
| `068426c` | desktop | feat: Granola-style share modal + templates dropdown |
| `bc0614e` | desktop | feat: series sidebar + detail view on desktop |
| `e8eb82f` | web | fix: bot-ingest resilience — split step 5/6 catch |
| `1e5c039` | web | feat: AI meeting series — schema, detection, tRPC, REST, web sidebar |
| `89b146b` | web | feat: PATCH /api/v1/series/{id} — rename series from desktop |
| `a548aef` | web | feat: REST — make-public, make-private, templates list |
| `05baa52` | web | feat: GET /api/v1/transcribe/token — Deepgram temp token |
| `4b943b2` | web | feat: ask-ai page reads ?q= param |
| `6b8da34` | web | feat: ask-ai page re-submit on new ?q= |
| `bb4a44a` | web | feat: calendar-bot worker — auto-deploy Recall.ai bot |
| `4a0fed9` | mobile | fix: Microsoft OAuth redirect URL |
| `5300ddd` | mobile | feat: Series screen on mobile |
| `1022719` | mobile | fix: series card navigation to SeriesDetailScreen |

---

*Kolasys AI | Confidential | Updated May 29, 2026*
*Next milestone: Build 23 + Manual folders + Marketing site*
