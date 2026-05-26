import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Kolasys AI collects, uses, and protects your data.',
}

const LAST_UPDATED = 'May 26, 2026'

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-white/40">Last updated: {LAST_UPDATED}</p>

      <div className="prose-marketing mt-10 space-y-10 text-white/70">

        <Section title="1. Overview">
          <p>
            Kolasys AI (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides AI-powered meeting
            transcription and summarization services through our web application at{' '}
            <a href="https://app.kolasys.ai" className="text-[#CA2625] hover:opacity-80">app.kolasys.ai</a>,
            iOS app, and Apple Watch app. This Privacy Policy explains what data we collect, how
            we use it, and your rights.
          </p>
          <p>
            By using Kolasys AI, you agree to the collection and use of information in accordance
            with this policy. If you do not agree, please discontinue use of our services.
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <Subsection title="Account information">
            When you create an account we collect your name, email address, and (if applicable)
            OAuth profile information through our authentication provider, Clerk.
          </Subsection>
          <Subsection title="Audio recordings">
            You upload or record audio files through our service. These files are stored
            encrypted in AWS S3 and are processed solely to produce transcripts and summaries.
          </Subsection>
          <Subsection title="Transcripts and summaries">
            The output of AI processing — transcripts, summaries, action items, and knowledge
            entities — is stored in our database and associated with your account.
          </Subsection>
          <Subsection title="Usage data">
            We collect standard server logs and product analytics (page views, feature usage,
            errors) to improve the service. This data is aggregated and does not contain the
            content of your recordings.
          </Subsection>
          <Subsection title="Device and browser data">
            When you use our web app, we collect standard browser and device information
            (IP address, browser type, operating system) for security and diagnostic purposes.
          </Subsection>
          <Subsection title="Payment data">
            Payment processing is handled by Stripe. We store only your Stripe customer ID;
            we never see or store raw card numbers.
          </Subsection>
        </Section>

        <Section title="3. How We Use Your Data">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>To provide, operate, and improve the Kolasys AI service</li>
            <li>To transcribe and summarize your audio recordings</li>
            <li>To generate AI responses to your questions about meetings</li>
            <li>To send transactional emails (meeting summaries, account notices)</li>
            <li>To process payments and manage subscriptions</li>
            <li>To detect and prevent fraud, abuse, and security incidents</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p className="mt-3 text-sm">
            We do not sell your data to third parties. We do not use the content of your
            recordings to train AI models.
          </p>
        </Section>

        <Section title="4. Third-Party Processors">
          <p>
            We share data with the following sub-processors only to the extent necessary to
            deliver the service:
          </p>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/40 text-xs uppercase">
                <th className="pb-2 pr-6 font-medium">Processor</th>
                <th className="pb-2 pr-6 font-medium">Purpose</th>
                <th className="pb-2 font-medium">Data shared</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {[
                ['Anthropic', 'AI summarization and Q&A', 'Transcript text'],
                ['OpenAI (Whisper)', 'Audio transcription', 'Audio files'],
                ['AWS S3', 'Audio file storage', 'Audio files'],
                ['Neon (PostgreSQL)', 'Database', 'All structured data'],
                ['Clerk', 'Authentication', 'Name, email'],
                ['Resend', 'Transactional email', 'Name, email'],
                ['Stripe', 'Payment processing', 'Email, billing info'],
                ['Upstash (Redis)', 'Job queue', 'Recording IDs (no content)'],
                ['PostHog', 'Product analytics', 'Usage events (no content)'],
                ['Sentry', 'Error monitoring', 'Error traces (no content)'],
              ].map(([processor, purpose, data]) => (
                <tr key={processor}>
                  <td className="py-2.5 pr-6 font-medium text-white/80">{processor}</td>
                  <td className="py-2.5 pr-6">{purpose}</td>
                  <td className="py-2.5 text-white/50">{data}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm">
            All processors are required to handle your data in accordance with applicable
            privacy laws and their own privacy policies.
          </p>
        </Section>

        <Section title="5. Data Retention">
          <p>
            <strong className="text-white/80">Audio files</strong> are retained until you delete
            the recording, or until your account is deleted. Organizations on paid plans may
            enable automatic audio deletion after transcription in Settings.
          </p>
          <p>
            <strong className="text-white/80">Transcripts and summaries</strong> are retained for
            as long as your account is active or until you delete individual recordings.
          </p>
          <p>
            <strong className="text-white/80">Account data</strong> is deleted within 30 days of
            account closure.
          </p>
          <p>
            <strong className="text-white/80">Server logs</strong> are retained for up to 90 days
            for security and diagnostic purposes.
          </p>
        </Section>

        <Section title="6. Data Security">
          <p>
            Audio files are stored encrypted at rest in AWS S3 and transferred over TLS.
            Database access is restricted to application servers. We enforce authentication
            for all API endpoints. Our infrastructure runs on Vercel (web) and Railway
            (background workers), both of which maintain SOC 2 compliance programs.
          </p>
          <p>
            No method of transmission or storage is 100% secure. If you believe your
            account has been compromised, contact us immediately at{' '}
            <a href="mailto:hi@kolasys.ai" className="text-[#CA2625] hover:opacity-80">hi@kolasys.ai</a>.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>
            Depending on your location, you may have the following rights regarding your
            personal data:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li><strong className="text-white/80">Access</strong> — request a copy of the data we hold about you</li>
            <li><strong className="text-white/80">Correction</strong> — request correction of inaccurate data</li>
            <li><strong className="text-white/80">Deletion</strong> — request deletion of your account and associated data</li>
            <li><strong className="text-white/80">Portability</strong> — request an export of your recordings, transcripts, and summaries</li>
            <li><strong className="text-white/80">Objection</strong> — object to certain types of processing</li>
          </ul>
          <p className="mt-3 text-sm">
            To exercise any of these rights, email us at{' '}
            <a href="mailto:hi@kolasys.ai" className="text-[#CA2625] hover:opacity-80">hi@kolasys.ai</a>.
            We will respond within 30 days.
          </p>
        </Section>

        <Section title="8. Children's Privacy">
          <p>
            Kolasys AI is not directed to children under 13. We do not knowingly collect
            personal information from children. If you believe a child has provided us with
            personal information, contact us and we will delete it promptly.
          </p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of
            significant changes by email or by posting a notice in the application. Continued
            use of the service after changes take effect constitutes acceptance of the
            updated policy.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            If you have questions or concerns about this Privacy Policy, or to exercise your
            data rights, contact us at:
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
