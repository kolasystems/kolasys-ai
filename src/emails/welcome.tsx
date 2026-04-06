// Kolasys AI — Welcome email
// Sent when a new user signs up (user.created Clerk webhook).

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Hr,
  Link,
} from '@react-email/components'

interface WelcomeEmailProps {
  firstName: string
  appUrl: string
}

export function WelcomeEmail({ firstName, appUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Kolasys AI — your AI meeting notes assistant</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Logo / brand */}
          <Heading style={h1}>Kolasys AI</Heading>

          <Text style={greeting}>Hi {firstName},</Text>

          <Text style={paragraph}>
            Welcome to Kolasys AI! You now have an AI-powered assistant that records,
            transcribes, and summarises your meetings — automatically.
          </Text>

          <Text style={paragraph}>Here&apos;s what you can do:</Text>

          <Text style={listItem}>🎙️ <strong>Upload a recording</strong> — drag and drop any audio or video file</Text>
          <Text style={listItem}>🌐 <strong>Record in browser</strong> — capture your microphone directly from the web app</Text>
          <Text style={listItem}>🤖 <strong>Deploy a meeting bot</strong> — join Zoom, Google Meet, or Teams automatically</Text>
          <Text style={listItem}>📝 <strong>Get structured notes</strong> — summaries, key points, and action items extracted for you</Text>

          <Hr style={divider} />

          <Button style={button} href={`${appUrl}/dashboard`}>
            Open Dashboard
          </Button>

          <Hr style={divider} />

          <Text style={footer}>
            Questions? Reply to this email — we&apos;re happy to help.
            <br />
            <Link href={appUrl} style={footerLink}>kolasys.ai</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  margin: '40px auto',
  padding: '40px',
  borderRadius: '8px',
  maxWidth: '560px',
  border: '1px solid #e5e7eb',
}

const h1: React.CSSProperties = {
  color: '#4f46e5',
  fontSize: '28px',
  fontWeight: 700,
  margin: '0 0 24px',
}

const greeting: React.CSSProperties = {
  fontSize: '16px',
  color: '#111827',
  margin: '0 0 16px',
}

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.6',
  margin: '0 0 12px',
}

const listItem: React.CSSProperties = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.6',
  margin: '0 0 8px',
  paddingLeft: '8px',
}

const divider: React.CSSProperties = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
}

const button: React.CSSProperties = {
  backgroundColor: '#4f46e5',
  color: '#ffffff',
  borderRadius: '6px',
  padding: '12px 24px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}

const footer: React.CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
  lineHeight: '1.5',
  margin: '0',
}

const footerLink: React.CSSProperties = {
  color: '#4f46e5',
  textDecoration: 'none',
}
