// Kolasys AI — Bot avatar rendering service.
//
// Composites a user-supplied logo onto the branded 1280×720 bot camera
// frame using sharp (libvips). Outputs a JPEG ready for Recall.ai's
// automatic_video_output.b64_data field.
//
// Pipeline:
//   1. Resize source image to 380×380
//   2. Apply circular mask via SVG dest-in composite
//   3. Overlay glass orb highlight (soft white ellipse, blurred)
//   4. Composite circular logo onto the radial gradient background (bot-bg.jpg)
//   5. Render display name as SVG text below the logo
//   6. Output as JPEG quality 90

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'

const LOGO_SIZE = 380
const LOGO_RADIUS = LOGO_SIZE / 2
const BG_W = 1280
const BG_H = 720
// Logo centered, 40px above vertical midpoint
const LOGO_LEFT = Math.floor((BG_W - LOGO_SIZE) / 2)
const LOGO_TOP = Math.floor((BG_H - LOGO_SIZE) / 2) - 40
const TEXT_Y = LOGO_TOP + LOGO_SIZE + 55

function loadBg(): Buffer {
  return readFileSync(join(process.cwd(), 'public', 'bot-bg.jpg'))
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function renderBotAvatar(
  logoBuffer: Buffer,
  displayName: string,
): Promise<Buffer> {
  // 1 + 2 — resize + circular mask
  const circleSvg = Buffer.from(
    `<svg width="${LOGO_SIZE}" height="${LOGO_SIZE}">
       <circle cx="${LOGO_RADIUS}" cy="${LOGO_RADIUS}" r="${LOGO_RADIUS}"/>
     </svg>`,
  )
  const roundLogo = await sharp(logoBuffer)
    .resize(LOGO_SIZE, LOGO_SIZE)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .png()
    .toBuffer()

  // 3 — glass orb highlight (blurred white ellipse on upper-left quadrant)
  const glowSvg = Buffer.from(
    `<svg width="${LOGO_SIZE}" height="${LOGO_SIZE}">
       <defs>
         <filter id="b"><feGaussianBlur stdDeviation="14"/></filter>
       </defs>
       <ellipse cx="130" cy="115" rx="88" ry="58" fill="rgba(255,255,255,0.22)" filter="url(#b)"/>
     </svg>`,
  )
  const logoOrb = await sharp(roundLogo)
    .composite([{ input: glowSvg }])
    .png()
    .toBuffer()

  // 4 + 5 — composite onto background + SVG text label
  const textSvg = Buffer.from(
    `<svg width="${BG_W}" height="${BG_H}">
       <text
         x="${BG_W / 2}" y="${TEXT_Y}"
         font-family="sans-serif" font-weight="bold" font-size="38"
         fill="white" text-anchor="middle" opacity="0.92"
       >${escapeXml(displayName)}</text>
     </svg>`,
  )

  return sharp(loadBg())
    .composite([
      { input: logoOrb, left: LOGO_LEFT, top: LOGO_TOP },
      { input: textSvg },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()
}
