'use client'

// Client half of /desktop-auth. The server component mints the token and
// passes the fully-formed `kolasys://auth?token=…` URL; we bounce the browser
// to it (which hands control to the desktop app) and show a spinner with a
// manual fallback in case the OS prompts before redirecting.

import { useEffect, useState } from 'react'

export function DesktopAuthRedirect({ url, email }: { url: string; email: string | null }) {
  const [launched, setLaunched] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = url
      setLaunched(true)
    }, 500)
    return () => clearTimeout(t)
  }, [url])

  return (
    <div style={wrap}>
      <div style={spinner} />
      <h1 style={heading}>Opening Kolasys desktop app…</h1>
      <p style={sub}>
        {email ? `Signed in as ${email}. ` : ''}
        You can return to the Kolasys app now.
      </p>
      <a href={url} style={link}>
        {launched ? 'Didn’t open? Click here to retry' : 'Open the app manually'}
      </a>
      <style>{keyframes}</style>
    </div>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0f0f0f',
  color: '#fff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  textAlign: 'center',
  padding: 24,
}
const spinner: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: '3px solid rgba(255,255,255,0.12)',
  borderTopColor: '#CA2625',
  animation: 'kolaspin 0.8s linear infinite',
  marginBottom: 24,
}
const heading: React.CSSProperties = { fontSize: 20, fontWeight: 600, margin: '0 0 8px' }
const sub: React.CSSProperties = { fontSize: 14, color: '#8e8e93', margin: '0 0 20px', maxWidth: 360, lineHeight: 1.5 }
const link: React.CSSProperties = { fontSize: 13, color: '#e23b3a', textDecoration: 'none', fontWeight: 500 }
const keyframes = '@keyframes kolaspin { to { transform: rotate(360deg); } }'
