import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Cross-file design-token invariants that no component test can see.
 *
 * `--color-button-bg` (the grey button/panel fill used by the map rails) is
 * defined to match the SENTINEL logo mark's outer ring, but the logo is a
 * standalone SVG served via <img> — it cannot reference the CSS custom
 * property, so the two hex values are duplicated by necessity. This test is
 * the sync guard the token's comment in template.css asks for: recolour one
 * without the other and it goes red.
 */
describe('design tokens', () => {
  it('keeps --color-button-bg in sync with the logo mark’s outer-ring grey', () => {
    // Paths resolve from the vitest root (frontend/vue) up to the repo-level
    // frontend/assets — import.meta.url is http-scheme under jsdom, so it
    // can't be used to locate the files.
    const templateCss = readFileSync(
      resolve(process.cwd(), '../../frontend/assets/template.css'),
      'utf8',
    )
    const logoSvg = readFileSync(resolve(process.cwd(), '../../frontend/assets/logo.svg'), 'utf8')

    const buttonBgToken = templateCss.match(/--color-button-bg:\s*(#[0-9a-fA-F]{6})/)?.[1]
    // The mark's ring is the only stroked circle in the logo.
    const logoRingStroke = logoSvg.match(/<circle[^>]*stroke="(#[0-9a-fA-F]{6})"/)?.[1]

    expect(buttonBgToken).toBeDefined()
    expect(logoRingStroke).toBeDefined()
    expect(buttonBgToken?.toLowerCase()).toBe(logoRingStroke?.toLowerCase())
  })
})
