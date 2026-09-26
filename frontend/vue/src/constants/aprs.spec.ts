import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  APRS_ACCENT_COLOR,
  APRS_BADGE_BACKGROUND,
  APRS_COUNT_RING,
  REPEATER_COUNT_RING,
} from './aprs'

/**
 * Cross-file invariants for the APRS label palette that no component test can
 * see — the same guard `assets/designTokens.spec.ts` provides for the button
 * grey and the logo mark.
 *
 * Marker elements are handed to MapLibre and live outside the Vue tree, so they
 * cannot read a CSS custom property; the values here are duplicated out of
 * necessity. Recolour one side without the other and this goes red.
 */
describe('APRS label palette', () => {
  it('matches the sidebar list background it is meant to sit with', () => {
    const sidebarCss = readFileSync(
      resolve(process.cwd(), 'src/components/shared/MapSidebar.vue'),
      'utf8',
    )
    // #map-sidebar is the panel the stations are listed in. It is painted from
    // the shared token now, so the invariant walks one step further: the panel
    // uses --panel-bg, whose hue is the dark theme's --canvas-rgb.
    const panelFill = sidebarCss.match(/#map-sidebar\s*\{[^}]*\}/)?.[0]
    expect(panelFill).toMatch(/background:\s*var\(--panel-bg\)/)

    const templateCss = readFileSync(
      resolve(process.cwd(), '../../frontend/assets/template.css'),
      'utf8',
    )
    const canvasHue = templateCss.match(/--canvas-rgb:\s*(\d+),\s*(\d+),\s*(\d+)/)
    expect(canvasHue).not.toBeNull()

    const [red, green, blue] = canvasHue!.slice(1, 4).map(Number)
    const asHex = `#${[red, green, blue].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`
    expect(APRS_BADGE_BACKGROUND).toBe(asHex)
  })

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
