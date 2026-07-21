import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import AppFooter from './AppFooter.vue'
import { useSettingsStore } from '@/stores/settings'
import { useSdrStore } from '@/stores/sdr'
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

  describe('SDR active-frequency indicator', () => {
    // Put the radio into the "parked on a single frequency" state the indicator
    // surfaces: streaming, not sweeping, tuned somewhere.
    function parkSdrOnFrequency(frequencyHz = 145_800_000) {
      const sdrStore = useSdrStore()
      sdrStore.currentFreqHz = frequencyHz
      sdrStore.playing = true
      sdrStore.scanSweeping = false
      sdrStore.searchSweeping = false
      return sdrStore
    }

    it('is hidden when the radio is not playing', () => {
      const wrapper = mount(AppFooter)
      expect(wrapper.find('#footer-sdr').exists()).toBe(false)
    })

    it('shows the tuned frequency when parked on a single frequency', () => {
      parkSdrOnFrequency(145_800_000)
      const wrapper = mount(AppFooter)
      const indicator = wrapper.find('#footer-sdr')
      expect(indicator.exists()).toBe(true)
      expect(indicator.find('.footer-sdr-freq').text()).toBe('145.800 MHz')
    })

    it('omits the name when the frequency is not a saved one', () => {
      parkSdrOnFrequency(145_800_000)
      const wrapper = mount(AppFooter)
      expect(wrapper.find('.footer-sdr-name').exists()).toBe(false)
      expect(wrapper.find('#footer-sdr').attributes('aria-label')).toBe('SDR active on 145.800 MHz')
    })

    it('shows the known name when the frequency matches a saved one', () => {
      const sdrStore = parkSdrOnFrequency(145_800_000)
      sdrStore.frequencies = [
        { id: 1, group_id: null, label: 'ISS VOICE', frequency_hz: 145_800_000, mode: 'NFM' },
      ]
      const wrapper = mount(AppFooter)
      expect(wrapper.find('.footer-sdr-name').text()).toBe('ISS VOICE')
      expect(wrapper.find('#footer-sdr').attributes('aria-label')).toBe(
        'SDR active on 145.800 MHz, ISS VOICE',
      )
    })

    it('is hidden while a scan is mid-sweep (hopping, not stopped)', () => {
      const sdrStore = parkSdrOnFrequency()
      sdrStore.scanSweeping = true
      const wrapper = mount(AppFooter)
      expect(wrapper.find('#footer-sdr').exists()).toBe(false)
    })

    it('is hidden while a search is mid-sweep (hopping, not stopped)', () => {
      const sdrStore = parkSdrOnFrequency()
      sdrStore.searchSweeping = true
      const wrapper = mount(AppFooter)
      expect(wrapper.find('#footer-sdr').exists()).toBe(false)
    })

    it('is hidden when there is no tuned frequency', () => {
      const sdrStore = parkSdrOnFrequency()
      sdrStore.currentFreqHz = 0
      const wrapper = mount(AppFooter)
      expect(wrapper.find('#footer-sdr').exists()).toBe(false)
    })

    it('is hidden in the SDR section while the RADIO tab is selected', () => {
      const sdrStore = parkSdrOnFrequency()
      sdrStore.activeTab = 'radio'
      const wrapper = mount(AppFooter, { props: { sdrSectionActive: true } })
      expect(wrapper.find('#footer-sdr').exists()).toBe(false)
    })

    it('is shown in the SDR section on tabs other than RADIO', () => {
      const sdrStore = parkSdrOnFrequency(145_800_000)
      sdrStore.activeTab = 'recordings'
      const wrapper = mount(AppFooter, { props: { sdrSectionActive: true } })
      expect(wrapper.find('#footer-sdr').exists()).toBe(true)
      expect(wrapper.find('.footer-sdr-freq').text()).toBe('145.800 MHz')
    })

    it('has no accessibility violations while the indicator is shown', async () => {
      const sdrStore = parkSdrOnFrequency(145_800_000)
      sdrStore.frequencies = [
        { id: 1, group_id: null, label: 'ISS VOICE', frequency_hz: 145_800_000, mode: 'NFM' },
      ]
      const wrapper = mount(AppFooter)
      expect(await axe(wrapper.html())).toHaveNoViolations()
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(AppFooter)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
