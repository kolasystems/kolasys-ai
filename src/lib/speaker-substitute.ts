// Kolasys AI — Display-time substitution of speaker IDs with the user-set
// label. Whisper diarization tags segments as "SPEAKER_0", "SPEAKER_1" etc;
// Claude often paraphrases that into "Speaker 0" / "Speaker 1" inside notes
// and action items. We don't rewrite the stored text — we substitute when
// rendering so renaming a speaker reflects everywhere immediately without a
// data migration.

type Label = { speakerId: string; displayName: string }

/**
 * Replace every occurrence of a tracked speaker ID (and its "Speaker N" /
 * "Speaker N:" variants) with the user-set display name. Returns the
 * original string when there are no labels.
 */
export function applySpeakerLabels(text: string, labels: Label[]): string {
  if (!text || labels.length === 0) return text

  let out = text
  for (const { speakerId, displayName } of labels) {
    const display = displayName.trim()
    if (!display || display === speakerId) continue

    const escaped = speakerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 1) Exact id match — "SPEAKER_0".
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), display)

    // 2) "Speaker 0" / "speaker 0" form. Only when the speakerId has the
    //    canonical SPEAKER_<n> shape; otherwise this could substitute things
    //    the user never intended.
    const m = /^SPEAKER_(\d+)$/.exec(speakerId)
    if (m) {
      const n = m[1]
      out = out.replace(
        new RegExp(`\\bSpeaker\\s+${n}\\b`, 'gi'),
        display,
      )
    }
  }
  return out
}
