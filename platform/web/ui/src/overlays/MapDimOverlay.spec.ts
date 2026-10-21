import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'

import MapDimOverlay from './MapDimOverlay.vue'

/**
 * Tests for the dimmed layer a map shows while its live data has stopped —
 * the SDR waterfall's scanning look, shared. The reason is said elsewhere
 * (a notice banner above it).
 */

describe('MapDimOverlay', () => {
  it('is a single empty layer', () => {
    const wrapper = mount(MapDimOverlay)

    expect(wrapper.classes()).toContain('map-dim-overlay')
    expect(wrapper.text()).toBe('')
  })

  it('is hidden from assistive tech, which hears the notice that explains it instead', () => {
    expect(mount(MapDimOverlay).attributes('aria-hidden')).toBe('true')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(MapDimOverlay)

    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
