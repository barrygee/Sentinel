import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import {
  registerSettingsSection,
  resetSettingsRegistryForTests,
} from '@sentinel/shell-api/shell/settingsRegistry'
import { SDR_MANAGER_SETTINGS_SECTION } from '@sentinel/shell-api/shell/sdrManagerSettingsSection'

// The panel and the two sync composables have their own specs; here they only
// have to be used. The panel stand-in shows whether it was pinned.
vi.mock('@/components/shared/SettingsPanel.vue', () => ({
  default: defineComponent({
    name: 'SettingsPanel',
    props: { pinned: { type: Boolean, default: false } },
    setup: (props) => () =>
      h(
        'section',
        { class: 'settings-panel-stub', 'aria-label': 'Settings' },
        String(props.pinned),
      ),
  }),
}))
const routeSync = vi.hoisted(() => vi.fn())
const configFileSync = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useSettingsRouteSync', () => ({ useSettingsRouteSync: routeSync }))
vi.mock('@/composables/useConfigFileSync', () => ({ useConfigFileSync: configFileSync }))

import SdrManagerOnlyShell from './SdrManagerOnlyShell.vue'

enableAutoUnmount(afterEach)

describe('SdrManagerOnlyShell', () => {
  beforeEach(() => {
    resetSettingsRegistryForTests()
    routeSync.mockClear()
    configFileSync.mockClear()
    document.title = ''
  })
  afterEach(() => {
    resetSettingsRegistryForTests()
  })

  describe('with SDR Manager for this machine registered', () => {
    beforeEach(() => {
      registerSettingsSection(SDR_MANAGER_SETTINGS_SECTION)
    })

    it('shows the Settings page pinned in place of the map', () => {
      const wrapper = mount(SdrManagerOnlyShell)

      expect(wrapper.get('main#main .settings-panel-stub').text()).toBe('true')
      expect(wrapper.text()).not.toContain('SDR MANAGER IS NOT RUNNING')
    })

    it('has no axe violations', async () => {
      const wrapper = mount(SdrManagerOnlyShell, { attachTo: document.body })

      expect(await axe(document.body)).toHaveNoViolations()
      wrapper.unmount()
    })
  })

  describe('without it (its container is stopped or still starting)', () => {
    it('says SDR Manager is not running instead of opening on App Settings', () => {
      registerSettingsSection({ key: 'app', label: 'App Settings', order: 0, domain: false })

      const wrapper = mount(SdrManagerOnlyShell)

      expect(wrapper.find('.settings-panel-stub').exists()).toBe(false)
      expect(wrapper.get('main#main [role="alert"]').text()).toContain('SDR MANAGER IS NOT RUNNING')
    })

    it('has no axe violations', async () => {
      const wrapper = mount(SdrManagerOnlyShell, { attachTo: document.body })

      expect(await axe(document.body)).toHaveNoViolations()
      wrapper.unmount()
    })
  })

  it('has a skip link to the main content and the SDR Manager-only nav bar', () => {
    const wrapper = mount(SdrManagerOnlyShell)

    expect(wrapper.get('a.skip-link').attributes('href')).toBe('#main')
    expect(wrapper.get('header#nav #logo-img').attributes('alt')).toBe('SENTINEL')
  })

  it('keeps the URL and the panel in step, and follows hand-edits of the config file', () => {
    mount(SdrManagerOnlyShell)

    expect(routeSync).toHaveBeenCalledOnce()
    expect(configFileSync).toHaveBeenCalledOnce()
  })

  it('titles the page after the mode', () => {
    mount(SdrManagerOnlyShell)

    expect(document.title).toBe('SENTINEL — SDR MANAGER')
  })
})
