import { describe, it, expect } from 'vitest'
import { APRS_ACCENT_COLOR, APRS_COUNT_RING, REPEATER_COUNT_RING } from './aprs'

/**
 * Invariants for the APRS label palette. The check against the shell's sidebar
 * and template.css lives with the SPA (aprsPaletteInvariant.spec.ts), since it
 * reads the shell's own files.
 */
describe('APRS label palette', () => {
  it('keeps label text and glyphs white, so colour stays meaningful on the maps', () => {
    // The Air domain uses hue to signal military / civil / emergency; Land must
    // not introduce a competing accent.
    expect(APRS_ACCENT_COLOR).toBe('#ffffff')
  })

  // Each Land layer groups its own points, and a count marker's ring is the
  // only thing saying which set it stands for — so the two must differ, and
  // each must stay translucent enough for the map to show through.
  describe('Land count-marker rings', () => {
    const rings = {
      APRS: APRS_COUNT_RING,
      repeaters: REPEATER_COUNT_RING,
    }

    it('gives each layer a ring no other layer uses', () => {
      expect(new Set(Object.values(rings)).size).toBe(Object.keys(rings).length)
    })

    it.each(Object.entries(rings))('keeps the %s ring translucent', (_layer, ring) => {
      const alpha = Number(ring.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1])
      expect(alpha).toBeGreaterThan(0)
      expect(alpha).toBeLessThan(1)
    })
  })
})
