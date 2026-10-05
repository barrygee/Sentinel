import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// <RadioIcon> lives in @sentinel/ui; this guard stays with the app because it
// scans the app's own call sites for a re-declared copy of the glyph.
describe('RadioIcon usage', () => {
  it('is the only copy of the glyph left in the app', () => {
    // The point of the component: the SDR mark previously existed as four
    // hand-copied SVGs (settings rail, SDR RADIO tab, and two Space auto-tune
    // buttons that had already drifted). A new inline copy would re-open that
    // drift, so no call site may re-declare the body rect's geometry.
    const sources = [
      'src/components/shared/SettingsPanel.vue',
      '../../services/sections/sdr/frontend/src/SdrPanel.vue',
      '../../services/sections/space/frontend/src/SpacePasses.vue',
      '../../services/sections/space/frontend/src/SpaceFilter.vue',
    ]

    for (const source of sources) {
      const markup = readFileSync(resolve(process.cwd(), source), 'utf8')
      expect(markup, `${source} should use <RadioIcon>`).toContain('<RadioIcon')
      expect(markup, `${source} re-declares the radio glyph inline`).not.toMatch(
        /<rect[^>]*x="3"[^>]*y="9"|d="M5 7h14v12H5z"/,
      )
    }
  })
})
