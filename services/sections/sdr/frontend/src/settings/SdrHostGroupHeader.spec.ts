import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrHostGroupHeader from './SdrHostGroupHeader.vue'
import SdrSourceStatusDot from '@sentinel/ui/sdr/SdrSourceStatusDot.vue'

describe('SdrHostGroupHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the host label and passes reachability through to the status dot', () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 3, label: 'Pi Roof', reachable: true, lastError: null },
    })
    expect(wrapper.find('.sdr-host-group-header-name').text()).toBe('Pi Roof')
    expect(wrapper.findComponent(SdrSourceStatusDot).props('connected')).toBe(true)
  })

  it('does not render an error span when lastError is null', () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 3, label: 'Pi Roof', reachable: true, lastError: null },
    })
    expect(wrapper.find('.sdr-host-group-header-error').exists()).toBe(false)
  })

  it('does not render an error span when lastError is an empty string', () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 3, label: 'Pi Roof', reachable: false, lastError: '' },
    })
    expect(wrapper.find('.sdr-host-group-header-error').exists()).toBe(false)
  })

  it('renders the last polling error, prefixed with an em dash, when the host is unreachable', () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 3, label: 'Pi Roof', reachable: false, lastError: 'connection refused' },
    })
    expect(wrapper.find('.sdr-host-group-header-error').text()).toBe('— connection refused')
  })

  it('passes a null reachable state through to the status dot as "checking"', () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 3, label: 'Pi Roof', reachable: null, lastError: null },
    })
    expect(wrapper.findComponent(SdrSourceStatusDot).props('connected')).toBeNull()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 3, label: 'Pi Roof', reachable: false, lastError: 'connection refused' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('links to the host in Settings › SDR Manager, named for screen readers', async () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 3, label: 'Pi Roof', reachable: true, lastError: null },
    })
    const link = wrapper.get('button.sdr-host-group-header-manage')
    expect(link.attributes('type')).toBe('button')
    expect(link.attributes('aria-label')).toBe('Manage Pi Roof in SDR Manager')
    expect(link.text()).toBe('SDR MANAGER')

    await link.trigger('click')

    const settingsStore = useSettingsStore()
    expect(settingsStore.open).toBe(true)
    expect(settingsStore.activeSection).toBe('sdr-manager')
    expect(settingsStore.focusSdrManagerHostId).toBe(3)
  })

  it('opens the host it heads, not another', async () => {
    const wrapper = mount(SdrHostGroupHeader, {
      props: { hostId: 11, label: 'Mast', reachable: null, lastError: null },
    })
    await wrapper.get('button.sdr-host-group-header-manage').trigger('click')
    expect(useSettingsStore().focusSdrManagerHostId).toBe(11)
  })
})
