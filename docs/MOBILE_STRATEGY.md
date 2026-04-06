# Kolasys AI — Mobile Strategy

This document defines the mobile product strategy: what we build, when we build it, how it connects to the existing backend, and what native capabilities we'll need.

**Approach:** Web first. Deploy and validate the web product, then bring Kolasys AI to mobile as a first-class companion app — not a scaled-down afterthought.

---

## Timeline

```
Phase 1 (current) — Web app
  └── Complete pipeline: upload → Whisper → Claude → notes

Phase 2 — Intelligence features
  └── Real-time transcription, calendar sync, vector search

Phase 3 — Native mobile apps
  └── React Native / Expo — iOS + Android
  └── Mac menu bar app (Swift)

Phase 4 — Ecosystem
  └── PLAUD NotePin hardware integration
  └── CRM sync, analytics
```

Mobile development begins after Phase 2 is deployed and the product has real users. The goal is to bring recording capability to places the web app can't reach (in-person meetings, mobile devices, hardware recorders).

---

## Platform: React Native + Expo

**Why Expo:**
- Single codebase for iOS and Android
- Clerk supports React Native natively (same auth flow)
- tRPC works over HTTP from any client — no backend changes needed
- `expo-av` provides audio recording on both platforms
- `expo-notifications` for push notifications when transcription completes
- Over-the-air (OTA) updates via Expo — deploy fixes without app store review
- Managed workflow for audio, calendar, background tasks

**Why not Flutter / native Swift+Kotlin:**
- React Native lets us share types and API contracts with the Next.js app
- The team already knows TypeScript; no new language to learn
- Expo's managed workflow covers all the capabilities we need

---

## iOS + Android Feature Parity Plan

### Phase 3.0 — Core recording (MVP)

| Feature | iOS | Android | Notes |
|---|---|---|---|
| Sign in with Clerk | ✅ | ✅ | Clerk React Native SDK |
| Org switcher | ✅ | ✅ | Same tRPC API |
| Record meeting audio | ✅ | ✅ | `expo-av` AudioRecorder |
| Upload recording | ✅ | ✅ | Same S3 presigned URL flow |
| View recordings list | ✅ | ✅ | tRPC `recordings.list` |
| View notes + action items | ✅ | ✅ | tRPC `recordings.get` |
| Push notification when ready | ✅ | ✅ | `expo-notifications` |

### Phase 3.1 — Calendar integration

| Feature | iOS | Android | Notes |
|---|---|---|---|
| Google Calendar sync | ✅ | ✅ | Same OAuth flow as web |
| Apple Calendar (EventKit) | ✅ | ❌ | iOS only — native EventKit via expo-calendar |
| Outlook Calendar | ✅ | ✅ | Microsoft Graph API |
| "Join + Record" from calendar event | ✅ | ✅ | One-tap meeting bot deploy |

### Phase 3.2 — Advanced mobile features

| Feature | iOS | Android | Notes |
|---|---|---|---|
| Background recording | ✅ | ✅ | See §Background Recording |
| Widget — today's meetings | ✅ | ✅ | iOS WidgetKit / Android App Widget |
| Share sheet — import audio | ✅ | ✅ | `expo-sharing` |
| Siri Shortcuts | ✅ | ❌ | iOS only |
| Google Assistant | ❌ | ✅ | Android only |
| Offline recording (no internet) | ✅ | ✅ | See §Offline Strategy |

---

## How Mobile Connects to the Existing Backend

The mobile app is a thin client — all intelligence stays on the server. No mobile-specific backend changes are needed for Phase 3.0.

### API layer
The same tRPC API used by the web app is consumed over HTTP from the mobile app:
```
Mobile App (React Native)
  → tRPC HTTP client (same AppRouter type)
  → Next.js API routes
  → Same Prisma DB, same BullMQ workers
```

### Auth
Clerk's React Native SDK handles auth:
```typescript
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
```
Clerk issues the same JWT tokens as on web. The `orgProcedure` in tRPC validates these tokens identically.

### File upload
The same presigned URL flow used on web works from mobile:
1. `tRPC recordings.getUploadUrl` → S3 presigned PUT URL
2. Mobile uploads the file directly to S3 (no routing through the API server)
3. `tRPC recordings.confirmUpload` → enqueues BullMQ transcription job
4. Same workers process the file

The only mobile-specific consideration: audio format. `expo-av` defaults to `.m4a` (AAC). Whisper accepts `.m4a`, `.mp4`, `.mp3`, `.wav`, `.webm` — all common formats are supported.

### Push notifications
When the summarisation worker sets `Recording.status = READY`, it publishes a push notification via Expo's push notification service:
```typescript
// In summarization.worker.ts — after setting status = READY
await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  body: JSON.stringify({
    to: user.expoPushToken,
    title: 'Your notes are ready',
    body: recording.title,
    data: { recordingId: recording.id },
  }),
});
```
Expo push tokens are stored in the `OrgMember` model (schema addition needed).

---

## Background Recording

Recording in the background while the phone screen is off is the most valuable — and most complex — mobile capability.

### iOS
Apple allows background audio recording only with the `audio` background mode declared in `Info.plist`. The app must actively be recording to stay alive in the background.

```xml
<!-- ios/Info.plist -->
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

With Expo: `expo-av` supports background audio natively when the background mode is configured.

**Caveat:** iOS will terminate background apps under memory pressure. The recording state must be checkpointed periodically to handle interruptions gracefully.

### Android
Android requires a `Foreground Service` for background audio recording. `expo-av` handles this automatically when the background mode is enabled.

The user sees a persistent notification while recording ("Kolasys AI is recording your meeting"). This is a requirement, not optional.

### Approach
1. On "Start Recording", activate a foreground service (Android) or background audio session (iOS)
2. Record in chunks (e.g., 5-minute segments) to avoid memory pressure
3. Each chunk is uploaded to S3 and queued for transcription as the meeting progresses
4. Final chunk is sent when the user taps "Stop Recording"
5. A final "stitch" job concatenates transcript segments in order

---

## Calendar Integration

Calendar integration turns Kolasys AI from reactive (record then upload) to proactive (automatically join and record scheduled meetings).

### Flow
1. User connects Google Calendar / Apple Calendar / Outlook in Settings
2. App fetches upcoming meetings with video conference links
3. "Today's meetings" shown on home screen and widget
4. 5 minutes before a meeting: push notification — "Start recording?"
5. User taps → app opens, recording starts automatically
6. For video meetings (Zoom, Meet, Teams): option to deploy a bot instead of local recording

### Calendar providers

**Google Calendar**
- OAuth via `expo-auth-session` with Google's OAuth endpoints
- Scopes: `https://www.googleapis.com/auth/calendar.readonly`
- Tokens stored encrypted in the DB (`CalendarConnection` model — see PHASE2.md)

**Apple Calendar (iOS only)**
- `expo-calendar` for direct access to the device's calendar (no OAuth needed)
- Read-only access to event titles, times, attendees, conference links
- No cloud sync — data never leaves the device except for Kolasys AI processing

**Outlook / Microsoft 365**
- OAuth via Microsoft Identity Platform
- Scopes: `Calendars.Read`
- `@microsoft/microsoft-graph-client` (same as web Phase 2 plan)

---

## Offline Recording Strategy

Offline recording (no internet connection) is essential for travel, basement meetings, or spotty conference wifi.

### Recording offline
Audio recording works entirely on-device — no internet required. The file is saved to the device's local storage.

### Sync when back online
On network reconnect:
1. App detects `expo-network` state change: offline → online
2. Queued local recordings are uploaded to S3
3. `confirmUpload` is called for each
4. Workers process them in order

### Local state
A local SQLite database (via `expo-sqlite`) stores the queue of pending uploads:
```
PendingUpload {
  id: string
  filePath: string   // local file path on device
  title: string
  duration: number
  createdAt: Date
  uploadedAt: Date | null
}
```

### Conflict handling
If a recording fails to upload after 3 retries, it is flagged as "upload failed" with an option for the user to retry manually or delete.

---

## PLAUD Hardware Integration (Phase 4)

[PLAUD NotePin](https://www.plaud.ai) is a hardware voice recorder that clips to a phone or sits on a desk. It records high-quality audio and syncs via Bluetooth to a companion app.

### Integration approach
1. PLAUD exposes a Bluetooth BLE profile for syncing recordings
2. The Kolasys AI iOS/Android app detects a paired PLAUD device
3. On Bluetooth sync, audio files are transferred from PLAUD → phone
4. Files are automatically queued for upload → transcription → summarisation

### Native requirements
- `expo-bluetooth` (or bare workflow + `react-native-ble-plx`)
- PLAUD's BLE service UUID and characteristic IDs (requires PLAUD developer partnership)

### Why this matters
PLAUD users are high-intent meeting note takers. The hardware recorder has better audio quality than a phone mic. This integration positions Kolasys AI as the best software companion for PLAUD — a distribution channel and a product differentiator.

---

## Mac Menu Bar App (Phase 3 — parallel to mobile)

A Mac menu bar app gives the same "always on" recording capability as the mobile app, but for desktop meetings.

**Tech:** Swift + SwiftUI (native macOS, not React Native)

**Why native:** Menu bar apps require deep macOS integration (Screen Recording permissions, menu bar extras, system audio capture via Core Audio). React Native does not support macOS menu bar apps.

**Features:**
- Live in the menu bar — one click to start/stop recording
- Auto-detect active audio input (Zoom, Meet, Teams via loopback)
- Upload recordings to same S3 bucket
- Notifications via macOS notification center
- SSO with Clerk via OAuth (system browser)

**Distribution:** Mac App Store or direct download. Notarised by Apple.

---

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | React Native + Expo | Shared TypeScript, shared API types, team familiarity |
| Auth | Clerk React Native SDK | Same auth as web — no new auth system |
| API | Same tRPC over HTTP | Zero backend changes needed |
| Audio recording | `expo-av` | Cross-platform, background support, Expo managed |
| Local DB | `expo-sqlite` | Offline queue persistence |
| Push notifications | Expo Push + APNs/FCM | Expo handles certificate management |
| Calendar | `expo-calendar` (iOS), Google/MS APIs | Native EventKit access on iOS; OAuth for cloud calendars |
| Offline sync | Manual queue with retry | Simple, visible to user, no magic |
| PLAUD | BLE via `react-native-ble-plx` | Requires bare workflow |
| Mac app | Swift + SwiftUI | Menu bar apps require native macOS APIs |
