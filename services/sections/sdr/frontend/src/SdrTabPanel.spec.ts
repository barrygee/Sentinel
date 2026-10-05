import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { axe } from 'jest-axe'

// SdrPanel is the large (~4k-line) main panel; stub it so the thin tab wrapper
// can be mounted on its own and its prop wiring asserted.
vi.mock('./SdrPanel.vue', () => ({
  default: defineComponent({
    name: 'SdrPanel',
    props: { fullPage: { type: Boolean, default: true } },
    template: '<div class="sdr-panel-stub" :data-full-page="String(fullPage)" />',
  }),
}))

import SdrTabPanel from './SdrTabPanel.vue'
import SdrPanel from './SdrPanel.vue'

enableAutoUnmount(afterEach)

describe('SdrTabPanel', () => {
  it('mounts SdrPanel in compact (non-full-page) mode', () => {
    const wrapper = mount(SdrTabPanel)
    const panel = wrapper.findComponent(SdrPanel)
    expect(panel.exists()).toBe(true)
    expect(panel.props('fullPage')).toBe(false)
    expect(wrapper.find('.sdr-panel-stub').attributes('data-full-page')).toBe('false')
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrTabPanel)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
