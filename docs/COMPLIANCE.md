# Kolasys AI — Compliance & Legal Guide

> **Disclaimer:** This document is for informational purposes only and does not constitute legal advice. Recording laws, consent requirements, and data protection obligations vary by jurisdiction and change over time. **Consult a qualified attorney before launching Kolasys AI commercially or processing recordings involving users in regulated industries or jurisdictions.**

---

## Table of Contents

1. [Recording Consent Laws (US States)](#1-recording-consent-laws-us-states)
2. [Federal Law (US)](#2-federal-law-us)
3. [GDPR (European Union)](#3-gdpr-european-union)
4. [CCPA (California)](#4-ccpa-california)
5. [HIPAA Considerations](#5-hipaa-considerations)
6. [Data Retention Policy](#6-data-retention-policy)
7. [Security Obligations](#7-security-obligations)
8. [Terms of Service & Privacy Policy Requirements](#8-terms-of-service--privacy-policy-requirements)
9. [What Needs a Lawyer Before Launch](#9-what-needs-a-lawyer-before-launch)
10. [Consent Banner Implementation Notes](#10-consent-banner-implementation-notes)

---

## 1. Recording Consent Laws (US States)

Recording laws in the US fall into two categories:

- **One-party consent** — only one person in the conversation needs to consent to recording (typically the person doing the recording).
- **Two-party / all-party consent** — all parties in the conversation must consent.

> The meeting bot (Recall.ai) joins meetings on behalf of the user. Whether the user alone constitutes sufficient consent — or whether all attendees must be notified — depends on state law and the specifics of how the bot is introduced.

### All-Party Consent States

These states require **all parties** to consent to being recorded:

| State | Law | Notes |
|---|---|---|
| **California** | Penal Code § 632 | Applies to "confidential communications." Criminal + civil penalties. Strictly enforced. |
| **Connecticut** | Conn. Gen. Stat. § 52-570d | All-party consent for telephonic/electronic communications. |
| **Delaware** | 11 Del. Code § 1335 | All parties must consent. |
| **Florida** | Fla. Stat. § 934.03 | Criminal penalties. Very actively enforced. |
| **Illinois** | 720 ILCS 5/14-1 | The Illinois Eavesdropping Act. One of the strictest. |
| **Maryland** | Md. Code, Courts § 10-402 | All-party consent. |
| **Massachusetts** | Mass. Gen. Laws ch. 272, § 99 | Criminal penalties. "Secret" recording prohibited. |
| **Michigan** | Mich. Comp. Laws § 750.539c | All-party consent. |
| **Montana** | Mont. Code Ann. § 45-8-213 | All-party consent. |
| **Nevada** | Nev. Rev. Stat. § 200.620 | All-party consent for wire communications. |
| **New Hampshire** | N.H. Rev. Stat. § 570-A:2 | All-party consent. |
| **Oregon** | Or. Rev. Stat. § 165.540 | All-party consent. |
| **Pennsylvania** | 18 Pa. Cons. Stat. § 5703 | Criminal penalties. Strictly enforced. |
| **Washington** | Rev. Code Wash. § 9.73.030 | All-party consent. Criminal + civil liability. |

### One-Party Consent States

All other US states (including New York, Texas, and most others) are one-party consent, meaning the person operating Kolasys AI can record without notifying other participants — though best practice (and many employers' policies) require disclosure.

### Practical guidance

**The safest approach for any US meeting:**
1. The Recall.ai bot announces itself by name ("Kolasys AI is recording this meeting").
2. Attendees are given the opportunity to leave if they do not consent.
3. A consent notice is displayed in the meeting platform's chat (can be automated via Recall.ai's bot name and in-meeting messages).

---

## 2. Federal Law (US)

### Electronic Communications Privacy Act (ECPA) / Federal Wiretap Act

18 U.S.C. § 2511 prohibits the intentional interception of electronic communications. It follows a one-party consent standard at the federal level, but state laws can be stricter and take precedence.

### Computer Fraud and Abuse Act (CFAA)

Less directly applicable, but accessing systems (e.g. meeting platforms) in ways that violate their Terms of Service can implicate the CFAA. Review the ToS of Zoom, Google Meet, and Microsoft Teams before deploying bots.

### Platform Terms of Service

| Platform | Bot Policy |
|---|---|
| Zoom | Permitted via the Zoom Marketplace / Meeting SDK; third-party bots require user approval |
| Google Meet | Generally permitted with the meeting host's knowledge |
| Microsoft Teams | Requires appropriate licensing and may require admin consent |

Recall.ai handles platform-level compliance for bot deployment. Review their Terms and your own platform agreements.

---

## 3. GDPR (European Union)

If any meeting participants are located in the EU/EEA, GDPR applies to Kolasys AI's processing of their personal data (voice recordings are personal data and may qualify as biometric data under Article 9).

### Key obligations

| Obligation | Requirement for Kolasys AI |
|---|---|
| **Lawful basis** | Identify a legal basis for processing (most likely: legitimate interests or explicit consent). Consent is stronger but harder to obtain at scale. |
| **Data Subject Rights** | Users can request access, rectification, erasure, and portability of their data. Must respond within 30 days. |
| **Data Minimisation** | Only record what is necessary. Do not retain raw audio longer than needed. |
| **Storage Limitation** | Define and enforce a data retention policy (see section 6). |
| **Data Protection by Design** | Encryption at rest and in transit, access controls, least-privilege IAM. |
| **Data Processing Agreements (DPA)** | Required with every sub-processor (OpenAI, Anthropic, Neon, Upstash, AWS, Recall.ai, Clerk). Most major vendors provide standard DPAs. |
| **Privacy Policy** | Must disclose: what data is collected, why, how long, who it's shared with, and how to exercise rights. |
| **Data Transfer** | If using US-based services (all current vendors), ensure SCCs (Standard Contractual Clauses) or equivalent are in place. |

### Article 9 — Special Category Data

Voice recordings **may** qualify as biometric data (Article 9) if they can be used to uniquely identify a person. If your use case involves speaker identification, this triggers stricter processing requirements (explicit consent, Data Protection Impact Assessment).

---

## 4. CCPA (California)

The California Consumer Privacy Act (and CCPA 2.0 / CPRA) gives California residents additional rights over their personal data.

### Applies if

- You do business in California AND
- Annual gross revenue > $25M, OR collect data of 100,000+ CA consumers, OR derive 50%+ of revenue from selling personal data.

Most early-stage startups are initially exempt but should prepare for compliance as they scale.

### Key rights

| Right | Implementation needed |
|---|---|
| Right to Know | Disclose what personal data is collected and how it's used |
| Right to Delete | Allow users to request deletion of their data |
| Right to Opt-Out of Sale | Kolasys AI must not sell personal data; if it does, provide opt-out |
| Right to Non-Discrimination | Cannot penalise users who exercise rights |
| Right to Correct | Allow users to correct inaccurate personal data |

### Privacy Policy additions

- "Do Not Sell or Share My Personal Information" link (if applicable)
- Categories of personal data collected
- Retention periods
- Third parties data is shared with

---

## 5. HIPAA Considerations

### Does HIPAA apply to Kolasys AI?

HIPAA applies if Kolasys AI is used to record meetings that involve **Protected Health Information (PHI)** — e.g. patient consultations, clinical team meetings, or healthcare administration conversations.

Kolasys AI in its standard form is **not designed to be HIPAA-compliant**. Processing PHI without HIPAA compliance exposes you and your customers to significant legal and financial liability.

### What HIPAA compliance would require

- **Business Associate Agreements (BAAs)** with all sub-processors (Neon, AWS, OpenAI, Anthropic, Recall.ai, Clerk, Upstash). Not all of these vendors currently offer BAAs.
- **Encryption at rest and in transit** for all PHI (AWS S3 SSE-KMS, encrypted PostgreSQL volumes).
- **Access controls and audit logs** for all PHI access.
- **Data retention and destruction procedures** aligned with HIPAA minimum necessary standard.
- **Incident response plan** for breaches (notification within 60 days under the Breach Notification Rule).
- **Employee training** on HIPAA policies.

### Recommendation

**Do not market Kolasys AI to healthcare customers until HIPAA compliance is achieved.** Add a ToS clause explicitly prohibiting use for HIPAA-covered meetings until that milestone is reached.

---

## 6. Data Retention Policy

### Recommended defaults

| Data type | Retention period | Rationale |
|---|---|---|
| Raw audio/video (S3) | 90 days after note generation | Minimise storage cost and privacy risk |
| Transcripts | 2 years | Useful for search; meets most enterprise expectations |
| Meeting notes | Indefinite (user-controlled) | Core product value |
| Action items | Indefinite (user-controlled) | Core product value |
| Processing logs | 30 days | Debugging; no long-term value |
| API keys (hashed) | Until revoked | Security audit trail |
| Webhook event logs | 30 days | Debugging |

### Implementation notes

- Build a scheduled job (e.g. daily cron) that deletes S3 objects and `ProcessingJob` records older than their retention period.
- Expose a **"Delete recording"** button that removes the S3 object, transcript, and note together.
- For GDPR "right to erasure" requests, deletion must cascade to all personal data including transcript segments and notes.
- Consider S3 Object Lifecycle policies for automatic deletion of raw audio.

### S3 Lifecycle policy example

```json
{
  "Rules": [
    {
      "ID": "DeleteRawAudioAfter90Days",
      "Prefix": "recordings/",
      "Status": "Enabled",
      "Expiration": { "Days": 90 }
    }
  ]
}
```

---

## 7. Security Obligations

### Encryption

| Data | Encryption |
|---|---|
| Audio/video files (S3) | AES-256 SSE (S3 default, or SSE-KMS for HIPAA) |
| Database (Neon) | TLS in transit; encrypted at rest by default |
| Redis (Upstash) | TLS (`rediss://`) |
| API keys stored in DB | HMAC-SHA256 hash only — never store raw keys |

### Access controls

- IAM policies scoped to least-privilege (see SETUP.md)
- Clerk RBAC for `OWNER` / `ADMIN` / `MEMBER` roles
- tRPC `orgProcedure` ensures org isolation at the API layer
- Database-level row filtering ensures users only access their org's data

### Incident response

- Subscribe to security alerts from all sub-processors
- Define a breach notification procedure before launch (GDPR requires 72-hour notification to supervisory authority; HIPAA requires 60-day notification)

---

## 8. Terms of Service & Privacy Policy Requirements

Before launch, you need both a **Terms of Service** and a **Privacy Policy**. Key clauses to include:

### Terms of Service

- Prohibition on recording without participant consent
- Prohibition on processing PHI without a BAA
- User responsibility for compliance with local recording laws
- Limitation of liability for legal violations by users
- Acceptable use policy
- Data retention and deletion terms
- Dispute resolution / governing law clause

### Privacy Policy

- What personal data is collected (recordings, transcripts, names, email, usage data)
- How it is used (transcription, AI processing, note generation)
- Who it is shared with (list all sub-processors with links to their privacy policies)
- How long it is retained (see section 6)
- User rights (access, deletion, correction, portability)
- Contact details for privacy enquiries / DPO (required under GDPR if processing at scale)
- Cookie policy
- For CCPA: "Do Not Sell" disclosure

---

## 9. What Needs a Lawyer Before Launch

The following items **require review by a qualified attorney** before Kolasys AI is made available to paying customers:

| Item | Risk if skipped |
|---|---|
| Terms of Service | Exposure to liability for user violations; no IP assignment; no limitation of liability |
| Privacy Policy | GDPR/CCPA fines; FTC enforcement; user distrust |
| Recording consent mechanism | Civil and criminal liability in all-party consent states |
| DPAs with sub-processors | GDPR Article 28 violation; inability to serve EU customers |
| HIPAA BAAs (if healthcare customers) | Up to $1.9M per violation category per year |
| Platform ToS review (Zoom, Meet, Teams) | Account termination; potential CFAA liability |
| Governing law and jurisdiction selection | Determines which courts and laws apply to disputes |
| Export compliance (OFAC) | Sanctions violation if used in restricted countries |

**Estimated cost of a startup legal review:** $2,000–$8,000 USD for a qualified startup attorney. This is not optional for a commercial product handling sensitive business communications.

---

## 10. Consent Banner Implementation Notes

### Meeting bot consent notification

When a Recall.ai bot joins a meeting, it should:

1. Have a clear bot name visible to all participants (configured as `bot_name: "Kolasys AI"` in the Recall.ai API call).
2. Optionally send a chat message: *"This meeting is being recorded by Kolasys AI for note-taking purposes. By continuing to participate, you consent to this recording. Please leave the meeting if you do not consent."*

### In-app consent acknowledgement

Before a user deploys a bot or starts a browser recording, show a consent confirmation:

> "By starting this recording, you confirm that all meeting participants have been notified and have consented to being recorded, as required by applicable law."

This shifts legal responsibility to the user (which must be backed by your Terms of Service) while providing a paper trail.

### Future: per-org consent settings

In Phase 2, add org-level settings for:
- Auto-consent message text and language
- Which meeting platforms require explicit consent banners
- Data residency region preferences (EU vs. US)
