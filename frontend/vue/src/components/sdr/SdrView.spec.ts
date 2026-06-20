import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'

// SdrWaterfall is a large canvas-backed component; stub it so SdrView can be
// mounted in isolation as the thin page wrapper it is. SdrDecodeDock is light
// enough to render for real (it just reads the store).
import { defineComponent } from 'vue'
import { vi } from 'vitest'

vi.mock('./SdrWaterfall.vue', () => ({
  default: defineComponent({
    name: 'SdrWaterfall',
    template: '<div class="sdr-waterfall-stub" />',
  }),
}))

import SdrView from './SdrView.vue'
import { useSdrStore } from '@/stores/sdr'

enableAutoUnmount(afterEach)

describe('SdrView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

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

  it('hides the decoder dock until digital decoding is enabled', async () => {
    const store = useSdrStore()
    const wrapper = mount(SdrView)
    expect(wrapper.find('.sdr-decode-dock').exists()).toBe(false)
    store.setDigitalEnabled(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-decode-dock').exists()).toBe(true)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrView)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('exposes a single screen-reader heading for the view', () => {
    const wrapper = mount(SdrView)
    const heading = wrapper.find('h1')
    expect(heading.exists()).toBe(true)
    expect(heading.classes()).toContain('sr-only')
    expect(heading.text()).toBe('SDR — radio spectrum')
  })
})
