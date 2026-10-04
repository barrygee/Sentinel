import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import AppFooter from './AppFooter.vue'
import { useSettingsStore } from '@/stores/settings'
import { registerFooterItem, resetFooterRegistryForTests } from '@/shell/footerRegistry'
import { useAppStore } from '@/stores/app'

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

  it('keeps the sidebar button visible while the settings panel is open', async () => {
    const wrapper = mount(AppFooter)
    const store = useSettingsStore()
    store.openPanel()
    await wrapper.vm.$nextTick()
    const button = wrapper.find('#map-sidebar-btn')
    expect(button.exists()).toBe(true)
    expect(button.attributes('style') ?? '').not.toContain('display: none')
    // While settings is open the button targets the settings rail, so its label
    // and active state track the settings sidebar rather than the map sidebar.
    expect(button.attributes('aria-label')).toBe('Toggle settings sidebar')
    expect(button.classes()).toContain('msb-btn-active')
  })

  it('toggles the settings sidebar (not the map sidebar) while settings is open', async () => {
    const wrapper = mount(AppFooter)
    const store = useSettingsStore()
    store.openPanel()
    await wrapper.vm.$nextTick()
    expect(store.sidebarOpen).toBe(true)
    await wrapper.find('#map-sidebar-btn').trigger('click')
    expect(store.sidebarOpen).toBe(false)
    // The map-sidebar toggle event must not fire while settings owns the button.
    expect(wrapper.emitted('toggle-sidebar')).toBeUndefined()
  })

  it('reflects the collapsed settings sidebar as an inactive button', async () => {
    const wrapper = mount(AppFooter)
    const store = useSettingsStore()
    store.openPanel()
    store.toggleSidebar()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#map-sidebar-btn').classes()).not.toContain('msb-btn-active')
  })

  it('toggles the settings panel when the settings button is clicked', async () => {
    const wrapper = mount(AppFooter)
    const store = useSettingsStore()
    expect(store.open).toBe(false)
    await wrapper.find('#settings-btn').trigger('click')
    expect(store.open).toBe(true)
  })

  describe('right side-menu toggle', () => {
    it('is absent on views without a right rail (hasRightMenu falsy)', () => {
      const wrapper = mount(AppFooter)
      expect(wrapper.find('#side-menu-btn').exists()).toBe(false)
    })

    it('is shown on views that have a right rail', () => {
      const wrapper = mount(AppFooter, { props: { hasRightMenu: true } })
      expect(wrapper.find('#side-menu-btn').exists()).toBe(true)
    })

    it('is hidden while the settings panel is open, even on an Air/Space route', async () => {
      const wrapper = mount(AppFooter, { props: { hasRightMenu: true } })
      const settingsStore = useSettingsStore()
      settingsStore.openPanel()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('#side-menu-btn').exists()).toBe(false)
    })

    it('toggles the app store side-menu visibility when clicked', async () => {
      const wrapper = mount(AppFooter, { props: { hasRightMenu: true } })
      const appStore = useAppStore()
      expect(appStore.sideMenuOpen).toBe(true)
      await wrapper.find('#side-menu-btn').trigger('click')
      expect(appStore.sideMenuOpen).toBe(false)
      await wrapper.find('#side-menu-btn').trigger('click')
      expect(appStore.sideMenuOpen).toBe(true)
    })

    it('reflects the open rail as an active button labelled "Hide map controls"', () => {
      const wrapper = mount(AppFooter, { props: { hasRightMenu: true } })
      const button = wrapper.find('#side-menu-btn')
      // Visible by default, so the button is active and offers to hide it.
      expect(button.classes()).toContain('msb-btn-active')
      expect(button.attributes('aria-label')).toBe('Hide map controls')
    })

    it('reflects the collapsed rail as an inactive button labelled "Show map controls"', async () => {
      const wrapper = mount(AppFooter, { props: { hasRightMenu: true } })
      const appStore = useAppStore()
      appStore.toggleSideMenu()
      await wrapper.vm.$nextTick()
      const button = wrapper.find('#side-menu-btn')
      expect(button.classes()).not.toContain('msb-btn-active')
      expect(button.attributes('aria-label')).toBe('Show map controls')
    })

    it('has no accessibility violations with the toggle present', async () => {
      const wrapper = mount(AppFooter, { props: { hasRightMenu: true } })
      expect(await axe(wrapper.html())).toHaveNoViolations()
    })
  })

  describe('registered footer items', () => {
    afterEach(() => {
      resetFooterRegistryForTests()
    })

    it('renders nothing extra when no section registered an item', () => {
      const wrapper = mount(AppFooter)
      expect(wrapper.find('#footer-right').findAll('.stand-in-item')).toHaveLength(0)
    })

    it('renders every registered item in order, before the settings button, with the active section', () => {
      const StandIn = (name: string) =>
        defineComponent({
          props: { activeSectionId: { type: String, required: true } },
          setup: (props) => () =>
            h('span', { class: 'stand-in-item' }, `${name}:${props.activeSectionId}`),
        })
      registerFooterItem({ id: 'second', order: 20, component: StandIn('second') })
      registerFooterItem({ id: 'first', order: 10, component: StandIn('first') })

      const wrapper = mount(AppFooter, { props: { activeSectionId: 'sea' } })

      const right = wrapper.find('#footer-right')
      expect(right.findAll('.stand-in-item').map((item) => item.text())).toEqual([
        'first:sea',
        'second:sea',
      ])
      expect(right.element.lastElementChild?.id).toBe('settings-btn')
    })

    it('passes an empty section id when none is given', () => {
      const Echo = defineComponent({
        props: { activeSectionId: { type: String, required: true } },
        setup: (props) => () => h('span', { class: 'stand-in-item' }, `[${props.activeSectionId}]`),
      })
      registerFooterItem({ id: 'echo', order: 10, component: Echo })

      const wrapper = mount(AppFooter)

      expect(wrapper.find('.stand-in-item').text()).toBe('[]')
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(AppFooter)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
