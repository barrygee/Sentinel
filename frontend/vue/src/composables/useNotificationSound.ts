// Subtle synthesized "blip" played when a new notification arrives.
// Generated via the Web Audio API so no audio asset is shipped, and a single
// shared AudioContext is reused across blips.

let _ctx: AudioContext | null = null

function _getCtx(): AudioContext | null {
  try {
    if (!_ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      _ctx = new Ctor()
    }
    // Resume if a prior user gesture suspended it.
    if (_ctx.state === 'suspended') void _ctx.resume()
    return _ctx
  } catch {
    return null
  }
}

/**
 * Play a subtle two-note "blip" alert. A quick low->high pair of soft tones
 * reads as a notification cue without being loud or jarring.
 * `emphasis` raises the pitch/volume slightly for higher-priority
 * notifications (e.g. emergencies).
 */
export function playNotificationSound(emphasis = false): void {
  const ctx = _getCtx()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const peak = emphasis ? 0.09 : 0.06
    const noteDur = 0.07            // length of each note
    const gap = 0.06               // start-to-start spacing of the two notes

    // Low then high: an ascending pair is the classic "alert" gesture.
    const f1 = emphasis ? 740 : 620
    const f2 = emphasis ? 1100 : 930

    const playNote = (freq: number, start: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      // Soft attack + decay so each note is a gentle blip, not a click.
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + noteDur + 0.01)
    }

    playNote(f1, now)
    playNote(f2, now + gap)
  } catch {
    // Audio is non-essential; ignore failures (autoplay policy, etc.).
  }
}
