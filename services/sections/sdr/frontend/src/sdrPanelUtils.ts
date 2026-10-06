// Pure helpers for SdrPanel.vue. No Vue / no DOM.
// (The dropdown menu-open settle window, MENU_OPEN_SETTLE_MS, moved to
// composables/useTeleportedMenu.ts with the rest of the shared menu
// behaviour.)

// Demodulation modes offered by the tuner and the frequency-manager forms.
export const MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW'] as const

// Hardware sample rates (rtl_tcp) offered by the RADIO tab's live dropdown and
// the frequency-manager forms' per-frequency SAMPLE RATE setting. Tiers match
// snapToValidSampleRate() below — the 1.024 MHz floor avoids the stuttering
// 250k/300k tiers measured on the remote Pi.
export const SAMPLE_RATE_OPTIONS = [1024000, 1536000, 1792000, 2048000] as const

export function formatBwHz(hz: number): string {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)} MHz`
  if (hz >= 1_000) return `${Math.round(hz / 1000)} kHz`
  return `${hz} Hz`
}

/**
 * The frequencies any supported tuner can reach — the backend enforces the same
 * range (`MIN_TUNE_HZ`/`MAX_TUNE_HZ` in radio_hub/services/sdr.py): 500 kHz (HF
 * on an RTL-SDR Blog V4) to 2.2 GHz (the E4000's ceiling). A 7.812 GHz tune from
 * an accidental digit-wheel scroll once wedged a dongle.
 */
export const SDR_MIN_TUNE_HZ = 500_000
export const SDR_MAX_TUNE_HZ = 2_200_000_000

/** Whether `hz` is a whole number of Hz a tuner can be sent to. */
export function isTunableHz(hz: unknown): hz is number {
  return (
    Number.isInteger(hz) && (hz as number) >= SDR_MIN_TUNE_HZ && (hz as number) <= SDR_MAX_TUNE_HZ
  )
}

// Parse a user-entered frequency. Strings under 30000 are assumed to be MHz
// (e.g. "100.5" → 100_500_000); larger values are taken as raw Hz. Anything a
// tuner cannot reach parses as null, so it is never sent.
export function parseFreqMhz(raw: string): number | null {
  const v = parseFloat(raw.replace(/[^\d.]/g, ''))
  if (isNaN(v) || v <= 0) return null
  const hz = v > 30000 ? v : Math.round(v * 1e6)
  return isTunableHz(hz) ? hz : null
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
