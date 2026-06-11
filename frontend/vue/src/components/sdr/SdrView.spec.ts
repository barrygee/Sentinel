import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'

// SdrWaterfall is a large canvas-backed component; stub it so SdrView can be
// mounted in isolation as the thin page wrapper it is.
import { defineComponent } from 'vue'
import { vi } from 'vitest'

vi.mock('./SdrWaterfall.vue', () => ({
  default: defineComponent({
    name: 'SdrWaterfall',
    template: '<div class="sdr-waterfall-stub" />',
  }),
}))

import SdrView from './SdrView.vue'

enableAutoUnmount(afterEach)

describe('SdrView', () => {
  it('renders the SDR page wrapper with the sdr domain marker', () => {
    const wrapper = mount(SdrView)
    const page = wrapper.find('#sdr-page')
    expect(page.exists()).toBe(true)
    expect(page.attributes('data-domain')).toBe('sdr')
  })

  it('mounts the waterfall child', () => {
    const wrapper = mount(SdrView)
    expect(wrapper.find('.sdr-waterfall-stub').exists()).toBe(true)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrView)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
