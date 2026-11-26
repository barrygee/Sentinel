import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import GlobeView from './GlobeView.vue'

// The settings read behind the start location; no backend in unit tests.
vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  getNamespace: vi.fn().mockResolvedValue(null),
}))

// The WebGL stage can't run in jsdom: stand in for it, keeping its contract
// (the zoom methods it exposes and the status it emits).
const GlobeStageStub = defineComponent({
  name: 'GlobeStage',
  emits: ['status-change'],
  setup(_props, { expose }) {
    expose({ zoomIn: vi.fn(), zoomOut: vi.fn() })
    return {}
  },
  template: '<div class="globe-stage-stub" />',
})

function mountView(options: { attachTo?: HTMLElement } = {}) {
  return mount(GlobeView, { ...options, global: { stubs: { GlobeStage: GlobeStageStub } } })
}

describe('GlobeView', () => {
  it('marks itself as the globe section on its own dark page', () => {
    const wrapper = mountView()
    const page = wrapper.find('#globe-page')

    expect(page.exists()).toBe(true)
    expect(page.attributes('data-domain')).toBe('globe')
    expect(page.classes()).toContain('theme-dark')
  })

  it('names the page for screen readers with its one heading', () => {
    const wrapper = mountView()
    const headings = wrapper.findAll('h1')

    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toBe('Globe — live aircraft, satellites, vessels and APRS stations')
    expect(headings[0]!.classes()).toContain('sr-only')
  })

  it('shows the zoom buttons while the globe runs, and a notice instead when it cannot', async () => {
    const wrapper = mountView()

    expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('Globe zoom')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    wrapper.findComponent(GlobeStageStub).vm.$emit('status-change', 'unavailable')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="group"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toContain('needs WebGL')
  })

  it('has no detectable accessibility violations', async () => {
    const wrapper = mountView({ attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
