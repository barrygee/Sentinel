import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { SIGNAL_METER_SEGMENTS, useSdrSignalMeter } from './useSdrSignalMeter'

function createMeter(options: { playing?: boolean; squelch?: number } = {}) {
  const playing = ref(options.playing ?? true)
  const squelch = ref(options.squelch ?? -120)
  return { playing, squelch, ...useSdrSignalMeter({ playing, squelch }) }
}

describe('useSdrSignalMeter — reading', () => {
  it('draws 36 segments and starts at rest', () => {
    expect(SIGNAL_METER_SEGMENTS).toBe(36)
    expect(createMeter().signalLit.value).toBe(0)
  })

  it('attacks fast: one strong reading moves 30% of the way to it', () => {
    const meter = createMeter()
    meter.updateSignalBar(0)
    // smoothed = -120 + 0.3 * 120 = -84 → (36 / 120) * 36 = 10.8 → 11 segments
    expect(meter.signalLit.value).toBe(11)
  })

  it('decays slowly: a weaker reading moves only 5% of the way down', () => {
    const meter = createMeter()
    meter.updateSignalBar(0) // smoothed -84
    meter.updateSignalBar(-120) // smoothed -84 + 0.05 * -36 = -85.8 → 10.26 → 10
    expect(meter.signalLit.value).toBe(10)
  })

  it('climbs towards the full meter for a sustained full-scale signal, never past it', () => {
    const meter = createMeter()
    for (let reading = 0; reading < 60; reading++) meter.updateSignalBar(0)
    expect(meter.signalLit.value).toBe(SIGNAL_METER_SEGMENTS)
    meter.updateSignalBar(40)
    expect(meter.signalLit.value).toBe(SIGNAL_METER_SEGMENTS)
  })

  it('never goes below zero for readings under the floor', () => {
    const meter = createMeter()
    meter.updateSignalBar(-200)
    expect(meter.signalLit.value).toBe(0)
  })

  it('keeps reading when the squelch flag is open or absent', () => {
    const meter = createMeter()
    meter.updateSignalBar(0, true)
    expect(meter.signalLit.value).toBe(11)
  })

  it('drops to rest when the squelch closes, then restarts from the floor', () => {
    const meter = createMeter()
    meter.updateSignalBar(0)
    meter.updateSignalBar(0, false)
    expect(meter.signalLit.value).toBe(0)
    meter.updateSignalBar(0, true)
    expect(meter.signalLit.value).toBe(11)
  })

  it('resetSignalMeter returns the meter to rest', () => {
    const meter = createMeter()
    meter.updateSignalBar(0)
    meter.resetSignalMeter()
    expect(meter.signalLit.value).toBe(0)
    meter.updateSignalBar(0)
    expect(meter.signalLit.value).toBe(11)
  })
})

describe('useSdrSignalMeter — audible', () => {
  it('is silent while not playing, whatever the squelch', () => {
    expect(createMeter({ playing: false, squelch: -120 }).signalAudible.value).toBe(false)
  })

  it('is audible while playing with the squelch open', () => {
    expect(createMeter({ squelch: -50 }).signalAudible.value).toBe(true)
  })

  it('mutes when the worklet reports the squelch shut', () => {
    const meter = createMeter({ squelch: -50 })
    meter.updateSignalBar(-100, false)
    expect(meter.signalAudible.value).toBe(false)
    meter.updateSignalBar(-40, true)
    expect(meter.signalAudible.value).toBe(true)
  })

  it('keeps the last squelch state when a reading carries no flag', () => {
    const meter = createMeter({ squelch: -50 })
    meter.updateSignalBar(-100, false)
    meter.updateSignalBar(-100)
    expect(meter.signalAudible.value).toBe(false)
  })

  it.each([-119, -120])('treats a squelch of %i dBFS as off: never mutes', (squelchDbfs) => {
    const meter = createMeter({ squelch: squelchDbfs })
    meter.updateSignalBar(-100, false)
    expect(meter.signalAudible.value).toBe(true)
  })

  it('mutes just above the off threshold (-118 dBFS)', () => {
    const meter = createMeter({ squelch: -118 })
    meter.updateSignalBar(-100, false)
    expect(meter.signalAudible.value).toBe(false)
  })

  it('follows the playing and squelch refs reactively', () => {
    const meter = createMeter({ playing: false, squelch: -50 })
    meter.updateSignalBar(-100, false)
    meter.playing.value = true
    expect(meter.signalAudible.value).toBe(false)
    meter.squelch.value = -120
    expect(meter.signalAudible.value).toBe(true)
  })
})
