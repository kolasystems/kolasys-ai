# Kolasys AI — Product Pipeline & Status
**Updated:** June 6, 2026  |  Confidential

---

## Executive Summary

Kolasys AI is a Claude-powered meeting intelligence platform with four production surfaces:
- **Web app** (app.kolasys.ai) — Vercel
- **iOS app** (Build 35 on TestFlight)
- **Mac desktop app** (Electron, local distribution only)
- **Apple Watch app** (Phase 1 + 2 live)

Core capture pipeline (audio → Whisper → Claude → Notes) is production-stable. Calendar bot auto-deploy went operational June 5, 2026 after fixing missing Microsoft/Google env vars on Railway calendar-bot-worker. Custom bot identity (per-user name + avatar) shipped June 5.

---

## ✅ COMPLETED

### Core Platform
- Web app — Next.js 16.2 + Prisma 7 + tRPC 11 + Clerk 7 + Neon + Upstash + S3
- iOS app — Expo SDK 54, 35 TestFlight builds shipped
- Mac desktop app — Electron, system audio + mic via ScreenCaptureKit
- Apple Watch app — Phase 1 (wrist recording) + Phase 2 (push notifications)
- Marketing site (kolasys.ai) — hero, features, pricing, privacy, terms
- Railway workers — transcription, summarization, calendar-bot, bot-ingestion (24/7)

### Capture Methods
- Audio upload via web (Voice Memos compatible)
- iOS Share Extension for Voice Memos
- Mac desktop botless capture
- Recall.ai bot capture (manual Send Bot)
- Auto-join calendar bot — fully operational
- Custom bot name + avatar per user

### AI & Processing
- Whisper transcription with auto re-encode for files >25MB
- Claude Opus summarization with Refine
- AI-generated titles (Haiku)
- Word-level audio sync
- Speaker renaming
- Multi-language (16 languages + auto-detect)
- Ask AI (global semantic search)
- Live transcription (Deepgram, desktop Pro overlay)
- Conversation Intelligence / Analytics
- Action items extraction
- Knowledge graph (entities)
- Soundbites (web)
- Semantic search (pgvector embeddings)

### Features
- Meeting Series (auto-detected + manual folders)
- Pre-meeting brief (28-32 min before, Redis)
- Meeting import (Fireflies, Otter, Fathom, Read AI)
- Share modal (Granola-style with permissions/expiry)
- Templates
- Contacts
- Daily digest email (8 AM cron)
- Post-meeting email
- REST API + API Keys (kol_... bearer)
- Stripe billing (Free / Pro $9.99 / Team $8.99/seat)
- SSO (Clerk SAML/OIDC, Enterprise)
- Calendar integration (Google + Microsoft OAuth)
- Onboarding flow (3 slides + notification + attribution)
- Three themes on desktop (dark/light/glass)
- Visual system harmonized (#EEEAE3 across web/iOS/desktop)
- Desktop menu bar widget (Granola-style)

---

## 🟡 IN PROGRESS

| Feature | Status |
|---------|--------|
| Mobile Build 36 | Bot identity UI built, awaiting Xcode archive |
| Bot avatar via output_video | Disabled — broke webhooks; needs Recall.ai support |
| OAuth "You are signed out" | Build 35 has logging — needs Xcode console diagnostic |
| Desktop calendar data integration | Shows "No calendars found" despite Microsoft connected |

---

## 🔴 NOT COMPLETED

### Blocking Public Launch
1. **Mobile in-app file picker** — Blocked by Expo SDK 54 + Xcode 16 SwiftUICore crash. Share Extension workaround in place.
2. **Desktop code sign + DMG** — Not started. electron-builder + Developer ID cert + notarization needed.
3. **Billing dunning** — invoice.payment_failed just logs. Need email + auto-suspend + recovery.
4. **Public App Store submission** — TestFlight only currently.

### Important Gaps
5. **Soundbites — mobile parity** — Web has it, mobile doesn't
6. **CRM integration** — HubSpot + Salesforce auto-push
7. **Webhooks** — on_recording_ready, on_transcription_complete, on_summary_ready
8. **Topic tracker** — Keyword highlighting in transcripts
9. **Compliance notification** — HIPAA/enterprise bot announces recording
10. **Apple Watch Phase 3** — Force Touch to bookmark transcript moment
11. **Android app** — Expo handles ~90%
12. **Windows desktop** — Competitive gap vs Granola
13. **Slack integration** — Competitive gap
14. **SOC2 compliance** — Enterprise sales blocker

### Smaller Items
- Free public tier marketing (Granola has 25 mtgs free)
- OAuth secret rotation (exposed in chat)
- iOS calendar filter (Settings lists calendars but doesn't filter view)
- Series backfill script
- Desktop calendar filter integration

---

## Critical Technical Decisions

- **Neon HTTP adapter**: No $transaction, no upsert, no updateMany. Use findFirst + update pattern.
- **OAuth redirect URLs split**: Google = AuthSession.makeRedirectUri(), Microsoft = Linking.createURL('/'). DO NOT unify.
- **Recall.ai automatic_video_output** silently nulls webhook_url. Disabled until Recall.ai support resolves.
- **calendar-bot-worker** needs its own copy of MICROSOFT_CLIENT_ID/SECRET + GOOGLE_CLIENT_ID/SECRET. Vercel vars do not reach Railway.
- **autoRecordMeetings** schema default is true, but existing orgs created before this may need manual toggle.
- **Prisma v7**: db push only, sequential calls only, no nested creates.
- **Mobile**: npm install --legacy-peer-deps always.
- **objectVersion fix**: sed 70→60 after any Xcode target add.

---

## Stripe Plans

| Plan | Price | Stripe Price ID |
|------|-------|----------------|
| Pro Monthly | $9.99/mo | price_1TReH9CSoXibpWfNkXad6PaK |
| Pro Yearly | $99/yr | price_1TReKGCSoXibpWfNx6C1HT1T |
| Team Monthly | $8.99/seat/mo | price_1TReOnCSoXibpWfNUod8NeTK |

**Enforcement:** FREE + no active trial = 3 recordings/month cap. Suspended orgs = all tRPC mutations blocked.

---

## Competitive Position (June 6, 2026)

| Feature | Granola | Fireflies | Fathom | Kolasys |
|---------|---------|-----------|--------|---------|
| Bot capture | ✗ | ✓ | ✓ | ✓ |
| Auto-join calendar | ✓ | ✓ | ✓ | ✓ |
| Bot-free desktop | ✓ | ✗ | ✓ | ✓ |
| Custom bot name | N/A | ~ | ✓ | ✓ |
| Custom bot avatar | N/A | ✗ | ✗ | ✓ unique |
| AI-native Claude | via MCP | ✗ GPT | ✗ GPT | ✓ native |
| Apple Watch | ✗ | ✗ | ✗ | ✓ unique |
| Voice Memos share | ✗ | ✓ | ✗ | ✓ |
| Soundbites | ✗ | ✓ | ✓ | ✓ web only |
| Live transcript | ✓ | ✓ | ✗ | ✓ Pro |
| Meeting series/folders | ✓ | ✗ | ✓ | ✓ |
| Pre-meeting brief | ✗ | ✗ | ✗ | ✓ unique |
| Share modal | ✓ | ✓ | ✓ | ✓ |
| Multi-language | 10 | 100+ | limited | 16 |
| No AI credits | ✓ | ✗ | ✓ | ✓ |
| CRM | Business+ | Pro+ | Business | ✗ |
| SOC2/HIPAA | ✗ | ✓ | ✗ | ✗ |
| Windows desktop | ✓ | ✗ | ✓ | ✗ |
| Android | ✗ | ✓ | ✗ | ✗ |

---

## Recommended Priority Order

### This Week
1. Build 36 to TestFlight (bot identity + image picker)
2. Fix bot avatar without breaking webhooks (Recall.ai support ticket)
3. Test auto-deploy pipeline end-to-end with real meeting
4. Desktop calendar data integration

### Next 2 Weeks
5. Billing dunning
6. Desktop DMG distribution
7. Public App Store submission
8. Compliance notification

### Post-Launch
9. Soundbites mobile parity
10. CRM integration
11. Webhooks
12. Apple Watch Phase 3
13. Android + Windows
