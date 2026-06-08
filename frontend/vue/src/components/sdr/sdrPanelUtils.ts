// Pure helpers for SdrPanel.vue. No Vue / no DOM.

export function formatBwHz(hz: number): string {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)} MHz`
  if (hz >= 1_000) return `${Math.round(hz / 1000)} kHz`
  return `${hz} Hz`
}

// Parse a user-entered frequency. Strings under 30000 are assumed to be MHz
// (e.g. "100.5" → 100_500_000); larger values are taken as raw Hz.
export function parseFreqMhz(raw: string): number | null {
  const v = parseFloat(raw.replace(/[^\d.]/g, ''))
  if (isNaN(v) || v <= 0) return null
  return v > 30000 ? v : Math.round(v * 1e6)
}

export function defaultBwHz(mode: string): number {
  switch (mode) {
    case 'WFM':
      return 500_000 // broadcast FM: ~±75kHz dev + stereo/RDS sidebands; 200k was too narrow → garbled audio
    case 'NFM':
      return 12_500
    case 'AM':
      return 10_000
    case 'USB':
    case 'LSB':
      return 3_000
    case 'CW':
      return 500
    default:
      return 10_000
  }
}

// rtl_tcp accepts a fixed list of sample rates; round the input up to the
// nearest valid rate.
//
// FLOOR at 1_024_000: the remote Pi's rtl_tcp delivers the 250k/300k tiers in
// a stuttering pattern — MEASURED ~2 stalls/sec of ~400-470ms (p99≈470ms) at
// 250k and 300k, vs ZERO stalls and p99≈136ms at 1.024MHz. Low bandwidths
// (esp. WFM dragged narrow) snapped to 250k → the "jumpy at low bandwidth"
// symptom. The only cost of the floor is a wider waterfall span at narrow
// bandwidths (cosmetic; the audio demod bandwidth is applied separately in
// the worklet, unaffected). Strictly better than a stuttering display.
export function snapToValidSampleRate(hz: number): number {
  if (hz <= 1474000) return 1024000
  if (hz <= 1761000) return 1536000
  if (hz <= 1921000) return 1792000
  return 2048000
}
