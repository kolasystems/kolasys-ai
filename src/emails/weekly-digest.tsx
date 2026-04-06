// Kolasys AI — Weekly digest email
// Sent every Monday to each org member summarising their week.

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
  Row,
  Column,
  Section,
} from '@react-email/components'

interface DigestRecording {
  id: string
  title: string
  duration: number | null  // seconds
  createdAt: Date
}

interface DigestActionItem {
  id: string
  title: string
  priority: string
  dueDate: Date | null
}

interface WeeklyDigestEmailProps {
  recipientName: string
  orgName: string
  recordings: DigestRecording[]
  actionItems: DigestActionItem[]
  weekStart: Date
  appUrl: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function WeeklyDigestEmail({
  recipientName,
  orgName,
  recordings,
  actionItems,
  weekStart,
  appUrl,
}: WeeklyDigestEmailProps) {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const weekLabel = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`

  const highPriorityItems = actionItems.filter(
    (i) => i.priority === 'HIGH' || i.priority === 'URGENT'
  )

  return (
    <Html>
      <Head />
      <Preview>
        {`${recordings.length} meeting${recordings.length !== 1 ? 's' : ''}, ${actionItems.length} open action item${actionItems.length !== 1 ? 's' : ''} — week of ${formatDate(weekStart)}`}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>Kolasys AI</Text>

          <Heading style={h1}>Your week in review</Heading>
          <Text style={subheading}>{weekLabel} · {orgName}</Text>

          <Text style={greeting}>Hi {recipientName},</Text>

          {/* Stats row */}
          <Section style={statsRow}>
            <Row>
              <Column style={statCell}>
                <Text style={statNumber}>{recordings.length}</Text>
                <Text style={statLabel}>meeting{recordings.length !== 1 ? 's' : ''}</Text>
              </Column>
              <Column style={statCell}>
                <Text style={statNumber}>{actionItems.length}</Text>
                <Text style={statLabel}>open action item{actionItems.length !== 1 ? 's' : ''}</Text>
              </Column>
              {highPriorityItems.length > 0 && (
                <Column style={statCell}>
                  <Text style={{ ...statNumber, color: '#dc2626' }}>{highPriorityItems.length}</Text>
                  <Text style={statLabel}>high priority</Text>
                </Column>
              )}
            </Row>
          </Section>

          {/* Recordings */}
          {recordings.length > 0 ? (
            <>
              <Text style={sectionHeader}>Meetings this week</Text>
              {recordings.slice(0, 5).map((r) => (
                <Section key={r.id} style={recordingRow}>
                  <Row>
                    <Column>
                      <Link href={`${appUrl}/dashboard/recordings/${r.id}`} style={recordingLink}>
                        {r.title}
                      </Link>
                    </Column>
                    <Column style={{ textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties}>
                      <Text style={metaText}>
                        {formatDuration(r.duration)} · {formatDate(r.createdAt)}
                      </Text>
                    </Column>
                  </Row>
                </Section>
              ))}
              {recordings.length > 5 && (
                <Text style={moreText}>+{recordings.length - 5} more recordings</Text>
              )}
            </>
          ) : (
            <Section style={emptyState}>
              <Text style={emptyText}>No meetings recorded this week.</Text>
            </Section>
          )}

          {/* Action items */}
          {actionItems.length > 0 && (
            <>
              <Hr style={divider} />
              <Text style={sectionHeader}>Open action items ({actionItems.length})</Text>
              {actionItems.slice(0, 8).map((item) => (
                <Text key={item.id} style={actionItemRow}>
                  ☐ {item.title}
                  {(item.priority === 'HIGH' || item.priority === 'URGENT') && (
                    <span style={urgentBadge}> {item.priority}</span>
                  )}
                  {item.dueDate && (
                    <span style={dueDateText}> · due {formatDate(item.dueDate)}</span>
                  )}
                </Text>
              ))}
              {actionItems.length > 8 && (
                <Text style={moreText}>+{actionItems.length - 8} more</Text>
              )}
            </>
          )}

          <Hr style={divider} />

          <Button style={button} href={`${appUrl}/dashboard`}>
            Open Dashboard
          </Button>

          <Hr style={divider} />

          <Text style={footer}>
            <Link href={appUrl} style={footerLink}>Kolasys AI</Link>
            {' · '}You&apos;re receiving this because you&apos;re a member of {orgName}.
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
  margin: '0 0 4px',
}

const subheading: React.CSSProperties = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '0 0 20px',
}

const greeting: React.CSSProperties = {
  fontSize: '15px',
  color: '#374151',
  margin: '0 0 20px',
}

const statsRow: React.CSSProperties = {
  backgroundColor: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: '6px',
  padding: '16px',
  margin: '0 0 20px',
}

const statCell: React.CSSProperties = {
  textAlign: 'center',
}

const statNumber: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  color: '#0369a1',
  margin: '0',
}

const statLabel: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '0',
}

const sectionHeader: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  margin: '0 0 8px',
}

const recordingRow: React.CSSProperties = {
  borderBottom: '1px solid #f3f4f6',
  padding: '8px 0',
}

const recordingLink: React.CSSProperties = {
  fontSize: '14px',
  color: '#4f46e5',
  textDecoration: 'none',
  fontWeight: 500,
}

const metaText: React.CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
  margin: '0',
}

const emptyState: React.CSSProperties = {
  textAlign: 'center',
  padding: '24px',
  backgroundColor: '#f9fafb',
  borderRadius: '6px',
  margin: '0 0 16px',
}

const emptyText: React.CSSProperties = {
  fontSize: '14px',
  color: '#9ca3af',
  margin: '0',
  fontStyle: 'italic',
}

const actionItemRow: React.CSSProperties = {
  fontSize: '14px',
  color: '#374151',
  margin: '0 0 6px',
  paddingLeft: '4px',
}

const urgentBadge: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  padding: '1px 5px',
  borderRadius: '999px',
  backgroundColor: '#fef2f2',
  color: '#dc2626',
  marginLeft: '4px',
}

const dueDateText: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
}

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
