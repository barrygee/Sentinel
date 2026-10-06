import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { APRS_BADGE_BACKGROUND } from '@sentinel/section-land/constants/aprs'

/**
 * Cross-file invariant for the Land section's APRS label palette that no
 * component test can see — the same guard `assets/designTokens.spec.ts`
 * provides for the button grey and the logo mark. It lives in the SPA because
 * it reads the shell's sidebar and template.css.
 *
 * Marker elements are handed to MapLibre and live outside the Vue tree, so they
 * cannot read a CSS custom property; the values are duplicated out of
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
})
