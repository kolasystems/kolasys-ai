# Kolasys AI — Session Log
## May 27, 2026 — covers May 6 → May 27, 2026

> Continues from `SESSION_2026-04-16.md` (last session doc). The interim
> April 17 – May 5 web work (dashboard redesign, admin portal, Stripe billing,
> shareable links, soundbites, web push, AI titles) is documented in
> `CLAUDE.md` (updated May 5). This log focuses on **May 6 → May 27** in full
> detail, with a condensed interim summary for continuity.

---

## Repos, Domains, People

| | |
|---|---|
| **Web** | https://github.com/kolasystems/kolasys-ai |
| **Mobile** | https://github.com/kolasystems/kolasys-ai-mobile |
| **Desktop** | https://github.com/kolasystems/kolasys-ai-desktop |
| **App (product)** | https://app.kolasys.ai |
| **Marketing** | https://kolasys.ai |
| **tRPC API** | https://app.kolasys.ai/api/trpc |
| **REST API** | https://app.kolasys.ai/api/v1 |
| **Owner** | Paul Kola — paul@kolasystems.com / paulkola@gmail.com |

**Domain split (new this period):** `kolasys.ai` serves the marketing site,
`app.kolasys.ai` serves the product. The root path on `app.` redirects to
`/sign-in`; the root path on `kolasys.ai` serves the landing page.

---

## TL;DR — What shipped May 6 → May 27

1. **Recall.ai bot capture pipeline** (web, May 5–7) — webhook → S3 → Redis
   queue → Railway worker → transcription. Production-grade after several
   region/timeout iterations.
2. **Large-audio re-encode** (web, May 13) — auto down-encode files over
   Whisper's 25 MB limit, progressive bitrate fallback.
3. **Desktop system-audio capture** (desktop, May 13–19) — ScreenCaptureKit
   Swift helper + ffmpeg mix; BlackHole detection fallback.
4. **Calendar OAuth** (web, May 18) — Google + Microsoft calendar integration.
5. **Voice-memo upload UX + mobile-web recording** (web, May 25).
6. **Marketing site + domain split** (web, May 26) — landing/pricing/privacy/
   terms on `kolasys.ai`, product gated on `app.kolasys.ai`.
7. **Desktop app full rebuild** (desktop, May 27) — Granola-style UI, browser
   OAuth sign-in (replaces API-key paste), personal notes, light/dark/glass
   themes.
8. **Desktop OAuth + personal notes backend** (web, May 27) — `/desktop-auth`
   page, `/api/v1/me`, `personalNotes` column + PATCH endpoint.

---

## Interim summary (Apr 17 – May 5) — already in CLAUDE.md

Condensed for continuity; see `CLAUDE.md` for full detail.

- **Apr 17–18 (web):** dark mode + glass UI redesign w/ persistence
  (`a4dc96b`), split-pane recording detail + Refine Summary (`10005fe`),
  markdown/card/sidebar polish (`8f8e957`, `01b4270`), Geist/Inter fonts
  (`6cc8eef`, `7ee9916`), contacts page + daily digest + global semantic
  search (`f6f0475`), conversation-intelligence analytics + post-meeting
  email (`2269ea5`).
- **Apr 21 (web):** brand identity / logo / `#CA2625` (`0dd8809`),
  multi-language transcription (`3c3ecf2`), Tier-1 SSO + custom bot name +
  Ask Kolasys prompts + desktop-capture type (`9c18e58`), public `/pricing`
  (`ba154b2`, `dd59497`), word-level audio sync (`d67c9a0`).
- **Apr 22–23 (web):** Fireflies-style dashboard + collapsible sidebar
  (`eccfe3a`, `a623c34`, `b290673`), Apple Watch Phase 2 push (`341e872`),
  personal knowledge graph (`6b89498`), template auto-apply (`bf2c17e`),
  AI suggestions panel (`fcfd8c0`).
- **Apr 27 (web):** API keys + REST v1 (`18ab7b8`), per-OrgMember push token
  (`c1de219`), REST v1 `POST /recordings` + `/confirm` desktop pipeline
  (`e4870fa`).
- **Apr 29 (web):** admin portal v2/v3 across 3 phases (`a575545`, `4a81dc5`,
  `1b56be1`, `5c78b22`, `fd6f396`), Stripe billing (`5997f2c`), TEAM plan +
  suspension + free-tier cap (`e49530f`, `f8307b2`), voice-memo upload +
  onboarding email + trial banner (`b454c66`), worker `server-only` crash fix
  (`9706898`).
- **Apr 30 (web):** shareable links + soundbites + web push (`5a28238`),
  Plaud-style share modal w/ permissions + expiry (`194f9ec`).
- **May 4–5 (web):** edit title / speaker rename / retry stuck (`130be9e`),
  AI-generated meeting titles (`e55375f`, `68cdb0c`), rename Recordings →
  Meetings (`83ef4d4`), Bearer-token checkout/portal (`5d6bf01`, `6f51991`).

---

## MAY 6 → MAY 27 — Full detail

### 1. Recall.ai bot capture pipeline (web) — May 5–7

The "Send Bot" path: a Recall.ai bot joins a Zoom/Meet/Teams meeting, records,
and POSTs a webhook when done; we pull the media into our normal transcription
pipeline. This took several iterations to get production-stable.

**Key files**
- `src/app/api/webhooks/recall/route.ts` — svix-verified webhook receiver
- `src/services/bot-ingest.service.ts` — downloads bot media → S3 → enqueue
- `src/lib/queues.ts` — adds `bot-ingestion` BullMQ queue (alongside
  `transcription`, `summarization`)

**Commits (web)**
| Hash | Date | Summary |
|---|---|---|
| `03d5a02` | 05-05 | recall webhook downloads audio → S3 → triggers transcription |
| `6648b24` | 05-05 | remove `transcription_options` from deploy (we use Whisper) |
| `57289d7` | 05-05 | set `bot_name` from org `botDisplayName` |
| `ce68600` | 05-05 | add Kolasys bot avatar SVG |
| `6fd805b` | 05-05 | bot name + avatar wired into deploy |
| `cae0577` | 05-05 | REST API accepts `mimeType` for correct S3 signing/extension |
| `6e711c6` | 05-05 | transcription worker derives Deepgram content-type from S3 ext |
| `b0f56c9` | 05-05 | webhook signature verification debug + svix check |
| `04e7d75` | 05-06 | webhook svix verification + desktop title AI generation |
| `4fdd56b` | 05-06 | log signature failure but allow through (debug) |
| `1e4e7e9` | 05-06 | log recall webhook event type |
| `31b1e3e` | 05-06 | handle `bot.done` + `recording.done`, region us-east-1 |
| `f6a5b16` | 05-06 | base URL us-east-1, handle `bot.fatal` |
| `da68ff7` | 05-06 | revert base URL to us-west-2 (account region) |
| `5437c19` | 05-06 | remove region from deploy — webhook delivery issues |
| `9797786` | 05-06 | `ingestBotMedia` via `next/server` `after()` — Vercel timeout fix |
| `b0f25fc` | 05-07 | granular `ingestBotMedia` logging (find silent failure) |
| `30e45ad` | 05-07 | replace `after()` with fire-and-forget Promise |
| `62159eb` | 05-07 | **bot ingestion via Redis queue + Railway worker — production-grade** |

**Lessons learned**
- Recall.ai **account region is us-west-2**; webhook delivery and base URL must
  match. Mismatched regions silently drop webhooks.
- `after()` / fire-and-forget in a Vercel serverless function is unreliable for
  long downloads → moved ingestion to the **`bot-ingestion` BullMQ queue on the
  Railway worker** (the durable fix in `62159eb`).
- Webhook is **svix-HMAC verified**; during debugging it logged-but-allowed
  failures, then was locked back down.

### 2. Large-audio re-encode (web) — May 13

- `7889987` — auto re-encode audio files over Whisper's 25 MB limit before
  sending. Later hardened with **progressive bitrate fallback 32k→16k→8k**
  (`0847c7a`, May 25) in `reencodeForWhisper`.

### 3. Calendar OAuth — Google + Microsoft (web) — May 18

- `a6d1c81` — Google + Microsoft calendar integration with OAuth.
- **Routes:** `src/app/api/auth/google/{callback}`,
  `src/app/api/auth/microsoft/{callback}`.
- **Routers:** `src/server/routers/calendar.router.ts`,
  `src/server/routers/integrations.router.ts`.
- Microsoft uses `@azure/msal-node` + `@microsoft/microsoft-graph-client`
  (already in deps). Replaces the earlier "Connect Microsoft — coming soon"
  stub.

### 4. Voice-memo upload UX + mobile-web recording (web) — May 25

| Hash | Summary |
|---|---|
| `0847c7a` | progressive bitrate fallback in `reencodeForWhisper` (32k→16k→8k) |
| `ddbb9ee` | dedicated `/upload` page, better iOS Voice Memo UX |
| `3ff66b5` | mobile-web recording button with **Wake Lock** (screen stays on) |
| `f93907c` | `/upload` page with correct iOS Voice Memos instructions |
| `cbfe629` | App Store link with real app ID |

- `src/app/upload/page.tsx` — public-ish upload helper for iOS Voice Memos.

### 5. Marketing site + domain split (web) — May 26

The product moved fully behind `app.kolasys.ai`; `kolasys.ai` is now a
marketing site.

| Hash | Summary |
|---|---|
| `4cd57d3` | sign-up page logo matches sign-in |
| `b618420` | **marketing site — landing page + pricing + privacy policy** |
| `a178732` | redirect signed-in users from `/` to `/dashboard` |
| `11999f6` | make marketing routes public in Clerk middleware |
| `d8bb30f` | marketing site links point to `app.kolasys.ai` |
| `4ffe767` | redirect `app.kolasys.ai` root to sign-in, marketing only on `kolasys.ai` |
| `786d13c` | marketing nav sign-in links → `app.kolasys.ai` |
| `2ce187e` | marketing nav "start free" links → `app.kolasys.ai/sign-up` |
| `6d0e623` | terms of service page |

- **Marketing route group:** `src/app/(marketing)/page.tsx` (+ `/privacy`,
  `/terms`, `/pricing`).
- **Middleware (`src/proxy.ts`):** host-aware — on `app.` subdomain, `/`
  redirects to `/sign-in`; marketing paths (`/`, `/privacy`, `/terms`,
  `/pricing`) are public.

### 6. Desktop app — full rebuild (desktop) — May 6 → May 27

The Electron menu-bar app evolved from a broken-audio prototype into a polished
Granola-style client with browser OAuth and themes.

**Audio capture saga**
| Hash | Date | Summary |
|---|---|---|
| `334eaa3` | 04-27 | initial Electron menu-bar app, REST upload |
| `ce54531` | 04-28 | spawn coreaudio directly (sox/node-record-lpcm16 failed on TCC) |
| `0598d86` | 05-05 | **getUserMedia in hidden BrowserWindow — replaces broken sox/ffmpeg** |
| `b50273b` | 05-05 | better audio device handling for Mac mini (no built-in mic) |
| `d38056f`,`19e93af` | 05-05 | fix upload URL mismatch + send correct `audio/webm` mimeType |
| `ef2e7c9`/`cc889ec`/`00cf736`/`7e9b5fe` | 05-05 | macOS tray icon iterations |
| `f528acc` | 05-13 | capture system audio + mic (both sides) |
| `c1f301f` | 05-13 | revert to mic-only + **BlackHole detection** for system audio |
| `2aa4125` | 05-19 | **ScreenCaptureKit system audio via Swift helper + ffmpeg mix** |

- Recording uses **getUserMedia** in a hidden `recorder.html` BrowserWindow
  (mic), optionally mixed with **ScreenCaptureKit** system audio
  (`assets/KolasysAudioCapture` Swift binary, macOS 12.3+) via **ffmpeg
  `amix`**. SCK requires Screen Recording permission; falls back to mic-only.
- Build SCK helper: `npm run build:swift`.

**May 27 desktop rebuild**
| Hash | Summary |
|---|---|
| `01bb36d` | main window + floating panel + bot capture + full React UI |
| `5c35a50` | **desktop UI redesign — Granola-style meeting cards, inline notes, record panel** |
| `193497f` | `openExternal` IPC — links open in system browser |
| `229791d` | **OAuth sign-in via browser — replaces API-key paste, adds logo, UI polish** |
| `1729544` | **My Notes textarea on meeting cards with auto-save** |
| `0186158` | **light/dark/glass themes — CSS custom properties + animated glass background** |
| `b8a161e` | logo letterform follows theme color, accent stays brand red |
| `a7bd2c4` | glass theme more transparent + verified all theme logos |

**Desktop architecture (current)**
- `src/main.js` — Electron main: tray, windows, IPC, `kolasys://` protocol
  registration (`setAsDefaultProtocolClient`), single-instance lock,
  `open-url` (mac) + `second-instance` (win/linux) → `handleAuthCallback`.
- `src/store.js` — **single shared `electron-store`** required by both
  `main.js` and `api.js` (two instances would desync). Schema: `authToken`,
  legacy `apiKey`.
- `src/api.js` — REST client; reads `authToken` from the shared store; methods
  `createRecording`, `uploadAudio`, `confirmRecording`, `listRecordings`,
  `getActionItems`, `updateNotes`, `getMe`, `deployBot`, `validateToken`.
- `src/preload.js` — `window.kolasys` bridge: `signIn`, `signOut`,
  `getAuthToken`, `getMe`, `getRecordings`, `getActions`, `updateNotes`,
  `startRecording`, `stopRecording`, `deployBot`, `openExternal`,
  `onRecordingStarted/Stopped/Error`.
- `src/renderer/index.html` — **self-contained vanilla JS/CSS** (no React/
  Tailwind/CDN). Sign-in view (token-gated), sidebar (logo + nav + record
  block), Meetings (date-grouped cards, inline AI notes via mini markdown
  renderer, action items, **My Notes** textarea), Upcoming (calendar via
  `getCalendar()` if exposed, else connect-card), Settings slide-in (Account +
  Appearance theme picker).

**Themes (desktop):** `html[data-theme="dark|light|glass"]` with CSS custom
properties (`--bg-main`, `--bg-sidebar`, `--bg-card`, `--bg-card-hover`,
`--text-primary`, `--text-muted`, `--border-color`, `--accent`, plus helpers
`--surface-2`, `--hover`, `--input-bg`, `--card-shadow`). Persisted to
`localStorage['kolasys-theme']`; pre-paint `<head>` script prevents flash;
default Dark. Glass = navy gradient + 3 animated blurred orbs (fixed,
`z-index:-1`) + `backdrop-filter` frosting. Logo letterform tinted to
`--text-primary` at render time (`getComputedStyle`), circuit accent always
`#CA2625`.

### 7. Desktop OAuth + personal notes — backend (web) — May 27

| Hash | Summary |
|---|---|
| `ee1d665` | **`/desktop-auth` page — auto-generate API key, redirect to `kolasys://`** |
| `ee5a609` | revoke prior `Desktop ·` API keys on each sign-in |
| `92711f5` | auto-close browser tab after redirect |
| `ba18246` | **personal notes — `personalNotes` column + PATCH notes API** |
| `b19aabe` | desktop-auth redirects to `/dashboard` if tab doesn't close |

- **`src/app/desktop-auth/page.tsx`** — Clerk-**protected** (NOT in public
  routes). Mints an org-scoped `kol_` key via the tRPC server caller
  (`appRouter.createCaller` → `apiKeys.create`, reusing org resolution +
  suspension gate), bakes the user's email into the key name (`Desktop ·
  <email>`), revokes prior desktop keys, then bounces the browser to
  `kolasys://auth?token=<key>`. Falls back to `/dashboard` if the tab doesn't
  auto-close. Client half: `src/app/desktop-auth/redirect-client.tsx`.
- **`src/app/api/v1/me/route.ts`** — bearer-authed identity; returns
  `{ email, keyName, orgId, orgName, orgSlug, plan }` (email parsed from the
  key name).
- **`src/app/api/v1/recordings/[id]/notes/route.ts`** — `PATCH` upserts
  `personalNotes` (org-scoped, 100k cap).
- **Schema:** `Recording.personalNotes String?` added via `prisma db push`
  (additive, nullable); included in the GET `/api/v1/recordings` select so the
  desktop loads saved notes on launch.

---

## Mobile (kolasys-ai-mobile) — Apr 18 → May 13

> **No May 26–27 work on mobile.** OAuth sign-in, themes, and personal notes
> shipped on **desktop only** — see the iOS Parity Backlog below.

**Highlights**
- **Apr 18–21:** dark mode + glass redesign (`16b6e18`, `cef7f98`, `b9034a7`),
  brand identity `#CA2625` (`72c8fdc`), app icon/splash/sign-in logo
  (`e88424d`), word-level audio sync (`9a36f27`), record-screen dark mode +
  language picker (`bce4237`).
- **Apr 22–23:** Apple Watch Phase 1/2/3 (`8e69a1c`…`451106a`) — SwiftUI watch
  target, WatchConnectivity bridge, push token, bookmark button; 4 new screens
  (ActionItems / Knowledge / AskAI / Templates) + nav restructure (`4d4ec10`).
- **Apr 27–29:** tRPC procedure fixes (`04f96d9`, `94ff1df`, `bfcf752`); **EAS
  Build → TestFlight** config (`317e99c`…`bf22455`, live `f56f3b7`); file
  upload added then reverted twice due to the **SwiftUICore / Xcode 16
  blocker** (`9bd3ba2`, `5d1052b`, `171375d`); billing screen + **iOS share
  extension for Voice Memos** (`9f64bdb`).
- **Apr 30:** share extension rewritten in **pure UIKit** to dodge the
  SwiftUICore crash (`d0a24d7`, `fe9b9c5`, `069d66c`); refine summary +
  word-sync + trial banner + billing portal + audio-retention settings
  (`e74e46d`); remove billing tab, disable bot-name field (`7e06438`).
- **May 4–5:** delete + edit title (`9186547`), regenerate AI title
  (`d53daf4`), rename Feed→Meetings + time-based greeting (`97c4a24`,
  `8c6c732`), `regenerateTitle` payload fix (`5626f03`), mobile billing →
  web checkout w/ Bearer token + real Stripe price IDs (`9bf5e71`, `1f767c8`,
  `34ed5ff`), round record button (`50b8c49`), CLAUDE.md → Build 20
  (`e40a23b`, `89cd1cf`-docs).
- **May 13:** **iOS background audio** — recording continues when screen locks
  (`cea3e56`).

**Mobile gotchas (carried forward)**
- `npm install --legacy-peer-deps` always.
- tRPC batch POST body must be `{ '0': { json: input } }`, not an array.
- SwiftUICore link error on Xcode 16 — keep the share extension pure UIKit;
  minimum deployment iOS 15.6.
- Local push only (no APNs) — fire on PROCESSING→READY via polling.

---

## Full commit index

### Web (`kolasys-ai`) — May 5 → May 27
```
b19aabe 05-27 desktop-auth redirects to dashboard if tab doesnt close
ba18246 05-27 personal notes — personalNotes column + PATCH notes API
92711f5 05-27 auto-close browser tab after desktop auth redirect
ee5a609 05-27 revoke prior Desktop API keys on sign-in
ee1d665 05-27 desktop-auth page — auto-generate API key, redirect kolasys://
6d0e623 05-26 terms of service page
2ce187e 05-26 marketing nav start free → app.kolasys.ai/sign-up
786d13c 05-26 marketing nav sign-in → app.kolasys.ai
4ffe767 05-26 redirect app.kolasys.ai root → sign-in, marketing on kolasys.ai
d8bb30f 05-26 marketing site links → app.kolasys.ai
11999f6 05-26 make marketing routes public in Clerk middleware
a178732 05-26 redirect signed-in users from / to /dashboard
b618420 05-26 marketing site — landing + pricing + privacy
4cd57d3 05-26 sign-up page logo matches sign-in
cbfe629 05-25 App Store link with real app ID
f93907c 05-25 /upload page correct iOS Voice Memos instructions
3ff66b5 05-25 mobile web recording button with Wake Lock
ddbb9ee 05-25 dedicated /upload page, better Voice Memo UX
0847c7a 05-25 progressive bitrate fallback in reencodeForWhisper
a6d1c81 05-18 Google + Microsoft calendar integration with OAuth
7889987 05-13 auto re-encode large audio before Whisper (25MB fix)
62159eb 05-07 bot ingestion via Redis queue + Railway worker (prod-grade)
30e45ad 05-07 replace after() with fire-and-forget Promise for ingestBotMedia
b0f25fc 05-07 granular ingestBotMedia logging
9797786 05-06 ingestBotMedia via after() — Vercel timeout fix
5437c19 05-06 remove region from Recall deploy — webhook delivery
da68ff7 05-06 revert Recall base URL to us-west-2
f6a5b16 05-06 recall base URL us-east-1, handle bot.fatal
31b1e3e 05-06 webhook handles bot.done + recording.done, us-east-1
1e4e7e9 05-06 log recall webhook event type
4fdd56b 05-06 log signature failure but allow through (debug)
04e7d75 05-06 webhook svix verification + desktop title AI generation
b0f56c9 05-05 webhook signature verification debug + svix check
6e711c6 05-05 worker derives Deepgram content-type from S3 ext
cae0577 05-05 REST API accepts mimeType for S3 signing/extension
6fd805b 05-05 bot name + avatar wired into Recall deploy
ce68600 05-05 add Kolasys bot avatar SVG
57289d7 05-05 set bot_name from org botDisplayName
6648b24 05-05 remove transcription_options from deploy (Whisper)
03d5a02 05-05 recall webhook downloads audio → S3 → transcription
```

### Desktop (`kolasys-ai-desktop`) — full history
```
a7bd2c4 05-27 glass theme more transparent + verify all theme logos
b8a161e 05-27 logo letterform follows theme color, accent stays brand red
0186158 05-27 light/dark/glass themes — CSS custom props + animated glass bg
1729544 05-27 My Notes textarea on meeting cards with auto-save
229791d 05-27 OAuth sign-in via browser — replace API key flow, add logo
193497f 05-27 openExternal IPC — links open in system browser
5c35a50 05-27 desktop UI redesign — Granola-style cards, inline notes
01bb36d 05-27 main window + floating panel + bot capture + full React UI
2aa4125 05-19 ScreenCaptureKit system audio via Swift helper + ffmpeg mix
c1f301f 05-13 revert to mic-only, add BlackHole detection
f528acc 05-13 capture system audio + microphone (both sides)
19e93af 05-05 send correct webm mimeType to API and S3
d38056f 05-05 fix desktop upload URL mismatch
b50273b 05-05 better audio device handling for Mac mini (no built-in mic)
7e9b5fe 05-05 proper monochrome template icon for menu bar
00cf736 05-05 disable template image to show full-color tray logo
cc889ec 05-05 Kolasys icon in macOS menu bar tray
ef2e7c9 05-05 proper macOS tray icon for menu bar app
0598d86 05-05 audio capture via getUserMedia hidden BrowserWindow
078e2c6 04-28 docs: CLAUDE.md — audio capture blocker, next session spec
27664ec 04-28 request mic permission before recording, guard filePath
ce54531 04-28 recorder spawn coreaudio directly, remove node-record-lpcm16
8de028f 04-27 set meeting title before createRecording
334eaa3 04-27 Kolasys AI desktop app — Electron menu bar, capture, REST upload
```

### Mobile (`kolasys-ai-mobile`) — Apr 18 → May 13
```
cea3e56 05-13 iOS background audio — recording continues when screen locks
89cd1cf 05-05 docs: CLAUDE.md → Build 20
e40a23b 05-05 docs: CLAUDE.md May 1-5
34ed5ff 05-05 real Stripe price IDs in mobile billing
1f767c8 05-05 mobile billing → checkout API with Bearer token
50b8c49 05-05 round record button on home screen
9bf5e71 05-05 mobile billing opens web checkout
5626f03 05-05 regenerateTitle payload id → recordingId
8c6c732 05-05 rename bottom nav Recordings → Meetings
97c4a24 05-05 time-based greeting, rename Feed → Meetings
d53daf4 05-04 regenerate AI title in overflow menu
9186547 05-04 delete + edit title, broader share audio types
7e06438 04-30 remove billing tab, disable bot name field
e74e46d 04-30 refine summary, word sync, trial banner, billing portal, retention
6be3b27 04-30 docs: share extension Build 14, iOS 15.6, pure UIKit
069d66c 04-30 copy shared file inside callback before sandbox cleanup
fe9b9c5 04-30 remove MobileCoreServices, plain UTI strings
d0a24d7 04-30 rewrite ShareViewController pure UIKit (SwiftUICore crash)
615d2d1 04-30 remove @objc rename — NSExtensionPrincipalClass mismatch
9c8147b 04-30 share extension activation rule — explicit UTI predicate
a4b52aa 04-30 add import Combine to ShareViewController
7f9241b 04-30 add ShareViewController.swift + Info.plist
9f64bdb 04-29 billing screen + iOS share extension for Voice Memos
171375d 04-29 revert file upload — SwiftUICore Xcode 16 blocker
38a16de 04-29 docs: TestFlight builds, pod install rule
5d1052b 04-29 revert file upload — needs pod install before rebuild
490f376 04-28 register expo-document-picker in app.json
9bd3ba2 04-28 file upload — pick audio + transcribe
a9076eb 04-28 RecordScreen isDevice — use Platform.OS
f56f3b7 04-28 docs: TestFlight live
bf22455 04-28 eas-build-post-install hook
5b0c010 04-28 drop prebuildCommand from eas.json
f534ea5 04-28 EAS build hook fixes CocoaPods objectVersion 70
92eb36a 04-28 .npmrc legacy-peer-deps for EAS
d610dca 04-28 remove invalid API key fields from eas.json
20abce6 04-28 App Store Connect API key for EAS submit
c17bdfd 04-28 correct Apple ID in eas.json
78ad0fc 04-28 Apple Team ID + App Store Connect ID
317e99c 04-28 EAS Build config for TestFlight
(see git log for Apr 18-27 — Apple Watch + screens + dark mode)
```

---

## Technical Reference

### Stack (unchanged core)
Next.js 16.2 (App Router) · tRPC 11 · Prisma 7 (Neon Postgres, HTTP adapter,
**no transactions / `db push` not `migrate`**) · Clerk 7 · Upstash Redis +
BullMQ · AWS S3 · Whisper + Deepgram · OpenAI embeddings (pgvector) · Anthropic
Claude · Resend · Vercel (web) + Railway (workers).

### BullMQ queues (`src/lib/queues.ts`)
`transcription` · `summarization` · `bot-ingestion` (new). Workers:
`src/workers/transcription.worker.ts`, `src/workers/summarization.worker.ts`
(both on Railway 24/7, us-east). Bot ingestion consumed by the worker via
`src/services/bot-ingest.service.ts`.

### Public routes (`src/proxy.ts`)
`/`, `/privacy`, `/terms`, `/pricing(.*)`, `/sign-in(.*)`, `/sign-up(.*)`,
`/share/(.*)`, `/api/webhooks/(.*)`, `/api/v1/(.*)`, `/api/stripe/(.*)`,
`/api/push/(.*)`, `/api/trpc/(.*)`. **`/desktop-auth` is intentionally NOT
public** (Clerk-protected). Host-aware: `app.` root → `/sign-in`.

### REST API (`/api/v1`, Bearer `kol_…`)
```
GET   /api/v1/me                              identity for the token
GET   /api/v1/recordings        (?limit≤200)  now includes personalNotes
POST  /api/v1/recordings                      create + presigned S3 URL (desktop)
POST  /api/v1/recordings/{id}/confirm         enqueue transcription
GET   /api/v1/recordings/{id}/transcript
GET   /api/v1/recordings/{id}/actions
PATCH /api/v1/recordings/{id}/notes           upsert personalNotes (NEW)
```

### Schema changes this period
- `Recording.personalNotes String?` (May 27, `prisma db push`).

### Env vars (additions / relevant)
- **Recall.ai:** `RECALL_API_KEY`, region **us-west-2** (account), webhook
  signing secret (svix).
- **Calendar:** `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, Microsoft (MSAL)
  client/tenant/secret.
- **Desktop protocol:** `kolasys://` registered via Electron
  `setAsDefaultProtocolClient`.
- Workers: `NEXT_PUBLIC_APP_URL=https://app.kolasys.ai` (Railway) — never
  localhost.

### Desktop key facts
- Talks to **production** `https://app.kolasys.ai`. Token = a `kol_` API key
  minted by `/desktop-auth`. Old pasted `apiKey` auto-migrates to `authToken`.
- Logos rendered from inlined SVG (paths from
  `web/src/components/kolasys-logo.tsx`).
- Bundle ID `com.kolasystems.kolasysai.desktop`; `npm start` (electron),
  `npm run build` (electron-builder dmg), `npm run build:swift` (SCK helper).

---

## Pending / Follow-ups

**Web**
- Recall.ai bot still flaky historically — monitor `bot-ingestion` queue depth
  in `/admin` worker-health card.
- `invoice.payment_failed` Stripe webhook still only logs (TODO: dunning email
  via Resend).
- Stripe `apiVersion` pinned older than v22 default — `@ts-expect-error`
  suppression in `src/lib/stripe.ts`.
- Share invites stored but **access not enforced** — `/share/{slug}` is open to
  anyone with the link.

**Desktop**
- **`getCalendar()` not exposed** in `preload.js` → Upcoming view always shows
  the connect-calendar fallback. Wire an IPC when ready.
- ScreenCaptureKit helper needs Screen Recording permission; unsigned dev
  builds are finicky under TCC. Code-sign for distribution.
- Verify the live browser→`kolasys://` round-trip on a packaged build (dev
  protocol routing under `npm start` is unreliable on macOS).
- App is not code-signed / notarized — required before distributing the dmg.

**Cross-cutting**
- Each `/desktop-auth` visit mints a new key (prior `Desktop ·` keys are
  revoked) — by design; keys are non-expiring so desktop stays logged in.

---

## iOS Parity Backlog (mobile is behind desktop/web)

Mobile last shipped **May 13**. The following landed on desktop/web after and
are **NOT yet on mobile**:

1. **Browser/OAuth sign-in polish** — desktop now uses browser OAuth handoff;
   mobile uses Clerk native. **Microsoft sign-in** parity (web has MS calendar
   OAuth; confirm MS sign-in on mobile).
2. **Personal notes ("My Notes")** — `personalNotes` PATCH API exists; add the
   editable notes field to the mobile recording detail screen.
3. **Calendar — Microsoft** — web added Google + Microsoft (May 18); mobile
   calendar should surface Microsoft events.
4. **Marketing/domain split** — ensure mobile deep links / App Store links
   point at `app.kolasys.ai` and `kolasys.ai` appropriately (App Store link
   updated `cbfe629`).
5. **Themes** — desktop has light/dark/glass; mobile has dark/glass — consider
   a **light** theme for parity.
6. **Large-audio re-encode** — web re-encodes >25 MB; confirm mobile uploads
   don't hit the Whisper limit (mobile records compressed, likely fine).
7. **Recall "Send Bot"** — verify the mobile bot-deploy path uses the
   production-grade queue ingestion.

**Pre-existing mobile backlog (from Apr 16 doc, still open):**
- Physical-device pipeline test (needs Apple Developer acct — now have
  TestFlight).
- Android build untested (`npx expo run:android`).
- Speaker label display (mobile shows raw `SPEAKER_0`).
- Add first name in Clerk (fixes "Hello, there").

---

## Useful Commands

```bash
# Web
cd ~/Desktop/kolasys-ai && npm run dev
cd ~/Desktop/kolasys-ai && npx tsx src/workers/transcription.worker.ts
cd ~/Desktop/kolasys-ai && npx tsx src/workers/summarization.worker.ts
cd ~/Desktop/kolasys-ai && npx prisma db push && npx prisma generate

# Desktop
cd ~/Desktop/kolasys-ai-desktop && npm start          # electron
cd ~/Desktop/kolasys-ai-desktop && npm run build:swift # ScreenCaptureKit helper
cd ~/Desktop/kolasys-ai-desktop && npm run build       # electron-builder dmg

# Mobile
cd ~/Desktop/kolasys-ai-mobile && npm install --legacy-peer-deps
cd ~/Desktop/kolasys-ai-mobile && npx expo run:ios
```

---

## Services & Credentials Reference

| Service | Purpose | Dashboard |
|---|---|---|
| Neon | PostgreSQL | neon.tech |
| Clerk | Auth (web pk_live, native API for mobile) | dashboard.clerk.com |
| Upstash | Redis / BullMQ | upstash.com |
| AWS S3 | Audio storage | console.aws.amazon.com |
| OpenAI | Whisper + embeddings | platform.openai.com |
| Deepgram | Transcription (alt path) | deepgram.com |
| Anthropic | Claude summarization | console.anthropic.com |
| Recall.ai | Meeting bot capture (region us-west-2) | recall.ai |
| Stripe | Billing | dashboard.stripe.com |
| Vercel | Web hosting | vercel.com → kolasys-ai |
| Railway | Worker hosting (us-east) | railway.app |
| Cloudflare | DNS — kolasys.ai + app.kolasys.ai | cloudflare.com |
| Resend | Email | resend.com |
| Apple | TestFlight / App Store Connect | appstoreconnect.apple.com |

---

*Last updated: May 27, 2026 — end of session. Covers May 6 → May 27 in detail;
April 17 – May 5 summarized (full detail in CLAUDE.md).*
