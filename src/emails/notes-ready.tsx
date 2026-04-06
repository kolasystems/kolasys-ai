// Kolasys AI — Notes ready email
// Sent when a recording's summarisation is complete (status → READY).

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
  Section,
} from '@react-email/components'

interface NotesReadyEmailProps {
  recipientName: string
  recordingTitle: string
  summary: string
  sections: Array<{ title: string; content: string }>
  actionItems: Array<{ title: string; priority: string }>
  recordingUrl: string
  appUrl: string
}

export function NotesReadyEmail({
  recipientName,
  recordingTitle,
  summary,
  sections,
  actionItems,
  recordingUrl,
  appUrl,
}: NotesReadyEmailProps) {
  const previewSections = sections.slice(0, 2)
  const previewActionItems = actionItems.slice(0, 3)

  return (
    <Html>
      <Head />
      <Preview>Your notes from &quot;{recordingTitle}&quot; are ready</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>Kolasys AI</Text>

          <Heading style={h1}>Your notes are ready 📝</Heading>

          <Text style={paragraph}>Hi {recipientName},</Text>
          <Text style={paragraph}>
            The notes from <strong>&quot;{recordingTitle}&quot;</strong> have been generated.
          </Text>

          {/* Summary */}
          {summary && (
            <Section style={card}>
              <Text style={sectionLabel}>Summary</Text>
              <Text style={summaryText}>{summary}</Text>
            </Section>
          )}

          {/* Key sections preview */}
          {previewSections.length > 0 && (
            <>
              <Text style={sectionHeader}>Key sections</Text>
              {previewSections.map((s, i) => (
                <Section key={i} style={sectionCard}>
                  <Text style={sectionTitle}>{s.title}</Text>
                  <Text style={sectionContent}>
                    {s.content.length > 200 ? s.content.slice(0, 200) + '…' : s.content}
                  </Text>
                </Section>
              ))}
            </>
          )}

          {/* Action items preview */}
          {previewActionItems.length > 0 && (
            <>
              <Text style={sectionHeader}>Action items ({actionItems.length} total)</Text>
              {previewActionItems.map((item, i) => (
                <Text key={i} style={actionItemRow}>
                  ☐ {item.title}
                  {item.priority !== 'MEDIUM' && (
                    <span style={priorityBadge(item.priority)}> {item.priority}</span>
                  )}
                </Text>
              ))}
              {actionItems.length > 3 && (
                <Text style={moreText}>+{actionItems.length - 3} more action items</Text>
              )}
            </>
          )}

          <Hr style={divider} />

          <Button style={button} href={recordingUrl}>
            View Full Notes
          </Button>

          <Hr style={divider} />

          <Text style={footer}>
            <Link href={appUrl} style={footerLink}>Kolasys AI</Link>
            {' · '}
            <Link href={`${appUrl}/dashboard`} style={footerLink}>Dashboard</Link>
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
  maxWidth: '600px',
  border: '1px solid #e5e7eb',
}

const brand: React.CSSProperties = {
  color: '#4f46e5',
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  margin: '0 0 16px',
}

const h1: React.CSSProperties = {
  color: '#111827',
  fontSize: '24px',
  fontWeight: 700,
  margin: '0 0 16px',
}

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.6',
  margin: '0 0 12px',
}

const card: React.CSSProperties = {
  backgroundColor: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: '6px',
  padding: '16px',
  margin: '16px 0',
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px',
  color: '#0284c7',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 8px',
}

const summaryText: React.CSSProperties = {
  fontSize: '14px',
  color: '#0c4a6e',
  lineHeight: '1.6',
  margin: '0',
}

const sectionHeader: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  margin: '20px 0 8px',
}

const sectionCard: React.CSSProperties = {
  borderLeft: '3px solid #e0e7ff',
  paddingLeft: '12px',
  margin: '0 0 12px',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#111827',
  margin: '0 0 4px',
}

const sectionContent: React.CSSProperties = {
  fontSize: '14px',
  color: '#4b5563',
  lineHeight: '1.5',
  margin: '0',
}

const actionItemRow: React.CSSProperties = {
  fontSize: '14px',
  color: '#374151',
  margin: '0 0 6px',
  paddingLeft: '4px',
}

const priorityBadge = (priority: string): React.CSSProperties => ({
  fontSize: '11px',
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: '999px',
  backgroundColor: priority === 'HIGH' || priority === 'URGENT' ? '#fef2f2' : '#fefce8',
  color: priority === 'HIGH' || priority === 'URGENT' ? '#dc2626' : '#ca8a04',
  marginLeft: '6px',
})

const moreText: React.CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
  margin: '4px 0 0',
  fontStyle: 'italic',
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
  margin: '0',
}

const footerLink: React.CSSProperties = {
  color: '#4f46e5',
  textDecoration: 'none',
}
