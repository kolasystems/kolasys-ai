// Kolasys AI — Resend email client singleton
// Import sendX helpers from this module; never instantiate Resend elsewhere.
import { Resend } from 'resend'
import type { ReactElement } from 'react'

export const resend = new Resend(process.env.RESEND_API_KEY)

// Override with RESEND_FROM_EMAIL env var to use a verified custom domain.
// 'onboarding@resend.dev' works during development (Resend test domain).
export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? 'Kolasys AI <onboarding@resend.dev>'

// ── Generic send wrapper ───────────────────────────────────────────────────────

interface SendEmailOptions {
  to: string | string[]
  subject: string
  react: ReactElement
  replyTo?: string
  /** Optional From override. Defaults to FROM_EMAIL. */
  from?: string
}

/**
 * Send a transactional email via Resend.
 * Returns the Resend message ID on success or null on failure (non-fatal).
 */
export async function sendEmail({ to, subject, react, replyTo, from }: SendEmailOptions) {
  try {
    const { data, error } = await resend.emails.send({
      from: from ?? FROM_EMAIL,
      to,
      subject,
      react,
      ...(replyTo && { replyTo }),
    })

    if (error) {
      console.error('[email] Resend error:', error)
      return null
    }

    return data?.id ?? null
  } catch (err) {
    console.error('[email] Failed to send email:', err)
    return null
  }
}
