import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms and conditions for using Kolasys AI.',
}

const LAST_UPDATED = 'May 26, 2026'

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">Terms of Service</h1>
      <p className="mt-2 text-sm text-white/40">Last updated: {LAST_UPDATED}</p>

      <div className="mt-10 space-y-10 text-white/70">

        <Section title="1. Acceptance of Terms">
          <p>
            By creating an account or using Kolasys AI (&quot;Service&quot;, &quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;), you agree to be bound by these Terms of Service
            (&quot;Terms&quot;). If you are using the Service on behalf of an organization, you
            represent that you have authority to bind that organization to these Terms.
          </p>
          <p>
            If you do not agree to these Terms, do not use the Service.
          </p>
        </Section>

        <Section title="2. Account Registration">
          <p>
            To access the Service you must create an account. You agree to provide accurate,
            current, and complete information during registration and to keep your account
            information up to date.
          </p>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials
            and for all activity that occurs under your account. Notify us immediately at{' '}
            <a href="mailto:hi@kolasys.ai" className="text-[#CA2625] hover:opacity-80">hi@kolasys.ai</a>{' '}
            if you suspect unauthorized access.
          </p>
          <p>
            You must be at least 13 years old to use the Service. Accounts are for individual
            humans; automated account creation is prohibited.
          </p>
        </Section>

        <Section title="3. Acceptable Use">
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>Record or transcribe individuals without their knowledge or consent</li>
            <li>Process audio that contains content that is illegal, harmful, or violates the rights of others</li>
            <li>Attempt to reverse-engineer, decompile, or extract the underlying models or systems</li>
            <li>Circumvent usage limits, rate limits, or access controls</li>
            <li>Resell, sublicense, or offer the Service as a standalone product to third parties</li>
            <li>Transmit malware, spam, or other malicious content</li>
            <li>Use the Service in any way that violates applicable laws or regulations</li>
          </ul>
          <p>
            We reserve the right to suspend or terminate accounts that violate these restrictions
            without prior notice.
          </p>
        </Section>

        <Section title="4. Payment and Billing">
          <Subsection title="Free plan">
            The Free plan includes up to 3 recordings per month at no charge. No credit card is
            required.
          </Subsection>
          <Subsection title="Pro plan">
            Pro is $9.99 per month (or $99 per year) per workspace. Pro includes unlimited
            recordings and all features.
          </Subsection>
          <Subsection title="Team plan">
            Team is $8.99 per seat per month, with a minimum of 3 seats. Team includes everything
            in Pro plus a shared workspace.
          </Subsection>
          <Subsection title="Free trial">
            Paid plans include a 14-day free trial. No charge is applied until the trial ends.
            You may cancel at any time during the trial period without being billed.
          </Subsection>
          <Subsection title="Billing cycle">
            Subscriptions are billed in advance on a monthly or annual basis. All fees are
            non-refundable except as required by law or as explicitly stated in these Terms.
          </Subsection>
          <Subsection title="Cancellation">
            You may cancel your subscription at any time through the billing portal in the
            application. Cancellation takes effect at the end of the current billing period;
            you retain access until then.
          </Subsection>
          <Subsection title="Price changes">
            We may change pricing with 30 days&apos; notice. Continued use after the notice period
            constitutes acceptance of the new pricing.
          </Subsection>
        </Section>

        <Section title="5. Data and Recordings">
          <p>
            <strong className="text-white/80">You own your data.</strong> Audio recordings,
            transcripts, summaries, and any other content you upload or create through the
            Service remain your property. We do not claim ownership of your content.
          </p>
          <p>
            You grant us a limited, non-exclusive license to process, store, and transmit your
            content solely to provide the Service to you. This license terminates when you
            delete the content or close your account.
          </p>
          <p>
            You represent that you have all necessary rights to upload the audio you submit —
            including the consent of any participants being recorded where required by law.
          </p>
        </Section>

        <Section title="6. AI Processing">
          <p>
            The Service uses third-party AI systems to transcribe and summarize your recordings.
            Audio and transcript content is transmitted to these processors as described in our{' '}
            <a href="/privacy" className="text-[#CA2625] hover:opacity-80">Privacy Policy</a>.
          </p>
          <p>
            AI-generated transcripts and summaries may contain errors, omissions, or
            inaccuracies. You are responsible for reviewing AI output before relying on it for
            any business, legal, or other consequential purpose. Kolasys AI is not liable for
            decisions made based on AI-generated content.
          </p>
          <p>
            We do not use the content of your recordings to train AI models.
          </p>
        </Section>

        <Section title="7. Service Availability">
          <p>
            We strive to maintain high availability but do not guarantee uninterrupted access
            to the Service. Scheduled maintenance, infrastructure failures, and third-party
            outages may cause temporary unavailability.
          </p>
          <p>
            <strong className="text-white/80">No uptime SLA is provided on the Free plan.</strong>{' '}
            Pro and Team plan customers may contact us regarding service availability concerns.
          </p>
          <p>
            We reserve the right to modify, suspend, or discontinue any part of the Service at
            any time with reasonable notice where practicable.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>
            Either party may terminate these Terms at any time. You may close your account
            through the application settings or by emailing{' '}
            <a href="mailto:hi@kolasys.ai" className="text-[#CA2625] hover:opacity-80">hi@kolasys.ai</a>.
          </p>
          <p>
            We may suspend or terminate your account immediately if you materially breach these
            Terms, fail to pay fees when due, or if we are required to do so by law.
          </p>
          <p>
            Upon termination, your right to access the Service ceases. We will delete your
            data within 30 days of account closure, subject to any legal retention obligations.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, Kolasys AI and its officers,
            employees, and affiliates shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages — including loss of profits, data, or goodwill —
            arising out of or in connection with your use of the Service, even if advised of the
            possibility of such damages.
          </p>
          <p>
            Our total aggregate liability to you for any claims arising under these Terms shall
            not exceed the greater of (a) the amount you paid us in the 12 months preceding the
            claim, or (b) $50 USD.
          </p>
          <p>
            Some jurisdictions do not allow the exclusion of certain warranties or limitations
            on liability; in those jurisdictions our liability is limited to the fullest extent
            permitted by law.
          </p>
        </Section>

        <Section title="10. Disclaimer of Warranties">
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranty of any kind,
            express or implied, including but not limited to warranties of merchantability,
            fitness for a particular purpose, and non-infringement.
          </p>
          <p>
            We do not warrant that the Service will be error-free, that defects will be
            corrected, or that AI-generated output will be accurate or complete.
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the laws of the State
            of Delaware, United States, without regard to its conflict-of-law provisions.
          </p>
          <p>
            Any disputes arising under these Terms shall be resolved exclusively in the state
            or federal courts located in Delaware, and you consent to personal jurisdiction in
            those courts.
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify you of material changes
            by email or by posting a prominent notice in the application at least 14 days before
            the changes take effect. Continued use of the Service after that date constitutes
            your acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            Questions about these Terms? Contact us at:
          </p>
          <address className="mt-3 not-italic text-sm">
            <strong className="text-white/80">Kolasys AI</strong><br />
            <a href="mailto:hi@kolasys.ai" className="text-[#CA2625] hover:opacity-80">hi@kolasys.ai</a>
          </address>
        </Section>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-white/80">{title}</h3>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  )
}
