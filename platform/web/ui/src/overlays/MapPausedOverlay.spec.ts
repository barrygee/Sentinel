import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'

import MapPausedOverlay from './MapPausedOverlay.vue'

/**
 * Tests for the dimmed, centred "paused" message a map shows while its live
 * data has stopped — the SDR waterfall's scanning look, shared.
 */

describe('MapPausedOverlay', () => {
  it('shows the headline and the detail line', () => {
    const wrapper = mount(MapPausedOverlay, {
      props: {
        headline: 'Online Data Source daily limit reached.',
        detail: 'Aircraft resume in about 5h 2m.',
      },
    })

    expect(wrapper.find('.map-paused-overlay-headline').text()).toBe(
      'Online Data Source daily limit reached.',
    )
    expect(wrapper.find('.map-paused-overlay-detail').text()).toBe(
      'Aircraft resume in about 5h 2m.',
    )
  })

  it('leaves out the detail line when there is none', () => {
    const wrapper = mount(MapPausedOverlay, { props: { headline: 'Paused.' } })

    expect(wrapper.find('.map-paused-overlay-detail').exists()).toBe(false)
  })

  it('is announced as a status, since it replaces data the screen reader was following', () => {
    const wrapper = mount(MapPausedOverlay, { props: { headline: 'Paused.' } })

    expect(wrapper.find('[role="status"]').text()).toBe('Paused.')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(MapPausedOverlay, {
      props: { headline: 'Paused.', detail: 'Resumes soon.' },
    })

    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
