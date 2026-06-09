import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import AppFooter from './AppFooter.vue'
import { useSettingsStore } from '@/stores/settings'

describe('AppFooter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('emits toggle-sidebar when the sidebar button is clicked', async () => {
    const wrapper = mount(AppFooter)
    await wrapper.find('#map-sidebar-btn').trigger('click')
    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1)
  })

  it('marks the sidebar button active when the sidebar is open', () => {
    const wrapper = mount(AppFooter, { props: { sidebarOpen: true } })
    expect(wrapper.find('#map-sidebar-btn').classes()).toContain('msb-btn-active')
  })

  it('hides the sidebar button while the settings panel is open', async () => {
    const wrapper = mount(AppFooter)
    const store = useSettingsStore()
    store.openPanel()
    await wrapper.vm.$nextTick()
    // v-show toggles inline display.
    expect(wrapper.find('#map-sidebar-btn').attributes('style')).toContain('display: none')
  })

  it('toggles the settings panel when the settings button is clicked', async () => {
    const wrapper = mount(AppFooter)
    const store = useSettingsStore()
    expect(store.open).toBe(false)
    await wrapper.find('#settings-btn').trigger('click')
    expect(store.open).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(AppFooter)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
