# Kolasys AI — Development Session
**Date:** Tuesday, April 21, 2026
**Time:** ~11:00 AM – 7:30 PM EDT

---

## Session Summary

Full build day. Completed Tier 1 and Tier 2 of the product pipeline in one session. Conducted full competitive market analysis. Shipped 9 features across web and mobile.

---

## What Was Built

### Web

| Feature | Status |
|---|---|
| SSO settings — Clerk SAML/OIDC (Enterprise plan gate) | ✅ Shipped |
| Custom bot name — editable in Settings > Recording capture | ✅ Shipped |
| Ask Kolasys prompt chips — 5 suggested prompts on Ask AI empty state | ✅ Shipped |
| Desktop capture tab in New Recording modal (Coming Soon) | ✅ Shipped |
| Schema: botDisplayName, ssoEnabled, ssoDomain, samlMetadataUrl on Organization | ✅ Shipped |
| wordsJson on TranscriptSegment | ✅ Shipped |
| Public pricing page at /pricing (Free/$0, Pro/$12, Team/$10/seat, Enterprise) | ✅ Shipped |
| Clerk middleware fix — /pricing added to public routes | ✅ Shipped |
| Word-level audio sync — click word → audio seeks to that timestamp | ✅ Shipped |
| Re-transcribe modal — Standard vs High quality selector | ✅ Shipped |

### Mobile

| Feature | Status |
|---|---|
| ContactsScreen — search, initials avatars, meeting count/talk time/last seen pills | ✅ Shipped |
| AnalyticsScreen — stat cards, 12-week bar chart, speaker talk time bars | ✅ Shipped |
| AppNavigator — SettingsStack with Contacts + Analytics screens | ✅ Shipped |
| SettingsScreen — DATA section with Contacts/Analytics nav rows | ✅ Shipped |
| Word-level audio sync — tap transcript word to seek audio | ✅ Shipped |

---

## Competitive Analysis

Full audit April 21, 2026:

| Company | Valuation | Key Finding |
|---|---|---|
| Granola | $1.5B (Series C March 2026) | Bot-free desktop is their entire moat. Mac + Windows. Only 10 languages (we have 16). |
| Fireflies.ai | $1B | Hidden AI credits = #1 user complaint. Strong mobile + soundbites + CRM. |
| Fathom | Private | Most generous free tier (unlimited recordings). Bot + bot-free both options. |
| Read.ai | Private | Real-time engagement/sentiment. Knowledge graph. SOC2/GDPR/HIPAA. |
| Zoom AI 3.0 | Public | Live transcription, Ask AI mid-call. Zoom ecosystem only. |
| Plaud | Hardware | $159+ physical device. No Apple Watch equivalent. |

Kolasys unique advantages confirmed: Claude-powered natively, no AI credits, Apple Watch planned (0 competitors have this), 16 languages.

---

## Schema Changes Applied to Neon DB

```prisma
model Organization {
  botDisplayName  String  @default("Kolasys AI")
  ssoEnabled      Boolean @default(false)
  ssoDomain       String?
  samlMetadataUrl String?
}

model TranscriptSegment {
  wordsJson String?  // JSON: [{word: string; start: number; end: number}]
}
```

---

## Key Architecture Decisions

**Word-level sync:** Whisper always requests `['segment', 'word']` granularities. Words stored as JSON on each segment. Old recordings without wordsJson gracefully fall back to plain text. New recordings get clickable words automatically.

**SSO approach:** Clerk has SAML/OIDC built-in. Settings UI captures ssoDomain and samlMetadataUrl in DB. Actual Clerk SSO config requires Enterprise plan + Clerk dashboard. UI is plan-gated.

**Pricing:** Free (300 min/mo, 5 summaries), Pro ($12/mo unlimited), Team ($10/seat/mo), Enterprise (custom). Flat rate — no AI credits ever.

---

## SettingsStack Navigation Pattern (Mobile — Critical Lesson)

`useNavigation()` inside a screen returns the parent navigator's context (tab), not its own stack. When SettingsScreen is the root of SettingsStack, it must accept navigation as a typed prop.

```tsx
// CORRECT
export default function SettingsScreen({
  navigation
}: {
  navigation: NativeStackNavigationProp<SettingsStackParamList, 'SettingsMain'>
}) { ... }

// WRONG — returns tab navigator, doesn't know Contacts/Analytics
const navigation = useNavigation()
```

---

## Git Commits This Session

### Web (kolasys-ai)
- `9c18e58` — feat(tier1): SSO, custom bot name, Ask Kolasys prompts, desktop capture tab
- `ba154b2` — feat(tier2): public pricing page at /pricing
- `dd59497` — fix: /pricing to public routes in Clerk middleware
- word sync commit — feat: word-level audio sync

### Mobile (kolasys-ai-mobile)
- `e0db879` — feat: SettingsStack + ContactsScreen + AnalyticsScreen (AppNavigator wired)
- `f84e225` — fix: SettingsScreen accepts navigation prop from SettingsStack
- word sync commit — feat: word-level audio sync — tap word to seek audio

---

## Remaining Pipeline

| Feature | Priority | Effort |
|---|---|---|
| Apple Watch Phase 1 (SwiftUI WatchOS — no competitor has this) | High | ~1 week |
| CRM integration — HubSpot + Salesforce | Medium | ~1 week |
| API keys page (replace Coming Soon) | Medium | ~2 days |
| Soundbites / highlight clips | Medium | ~1 week |
| Real-time transcription during meetings | Medium | ~2 weeks |

---

## Production State (End of Session)

- Web: app.kolasys.ai — Vercel, auto-deploys on main push
- Workers: Railway glorious-serenity — both online 24/7
- Mobile: Running on physical device. TestFlight pending Apple Developer account.
- Pricing: app.kolasys.ai/pricing — public, no login required

*Next session: Apple Watch Phase 1*
