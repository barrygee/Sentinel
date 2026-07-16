import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SourceOverrideControl from './SourceOverrideControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const NS = 'air'
const LS_KEY = `sentinel_${NS}_sourceOverride`

function mountControl() {
  return mount(SourceOverrideControl, { props: { ns: NS } })
}

describe('SourceOverrideControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('defaults to AUTO with the override note hidden', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const active = wrapper.find('.settings-source-override-btn.is-active')
    expect(active.attributes('data-value')).toBe('auto')
    expect(wrapper.find('.settings-source-override-note').exists()).toBe(false)
  })

  it('exposes the override pills as a keyboard-operable radio group', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const group = wrapper.find('.settings-source-override-group')
    expect(group.attributes('role')).toBe('radiogroup')
    expect(group.attributes('aria-label')).toBe('Data source override')

    // Roving tabindex: AUTO (the default) is checked and holds the tab stop.
    const autoBtn = wrapper.find('[data-value="auto"]')
    const onlineBtn = wrapper.find('[data-value="online"]')
    expect(autoBtn.attributes('role')).toBe('radio')
    expect(autoBtn.attributes('aria-checked')).toBe('true')
    expect(autoBtn.attributes('tabindex')).toBe('0')
    expect(onlineBtn.attributes('aria-checked')).toBe('false')
    expect(onlineBtn.attributes('tabindex')).toBe('-1')

    // ArrowRight selects ONLINE through the same select() path as a click,
    // so the change is staged too.
    await autoBtn.trigger('keydown', { key: 'ArrowRight' })
    expect(onlineBtn.attributes('aria-checked')).toBe('true')
    expect(onlineBtn.attributes('tabindex')).toBe('0')
    expect(onlineBtn.classes()).toContain('is-active')
    expect(wrapper.emitted('stage')).toHaveLength(1)
  })

  it('labels the offgrid option "OFF GRID"', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const offgrid = wrapper.find('[data-value="offgrid"]')
    expect(offgrid.text()).toBe('OFF GRID')
    expect(wrapper.find('[data-value="online"]').text()).toBe('ONLINE')
  })

  it('seeds the active option from localStorage', async () => {
    localStorage.setItem(LS_KEY, 'online')
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('.is-active').attributes('data-value')).toBe('online')
  })

  it('adopts a differing backend override on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ sourceOverride: 'offgrid' })
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('.is-active').attributes('data-value')).toBe('offgrid')
    expect(localStorage.getItem(LS_KEY)).toBe('offgrid')
  })

  it('selecting an option shows the note and stages the persisted change', async () => {
    const dispatched = vi.fn()
    window.addEventListener('sentinel:sourceOverrideChanged', dispatched)
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('[data-value="online"]').trigger('click')
    expect(wrapper.find('.is-active').attributes('data-value')).toBe('online')
    expect(wrapper.find('.settings-source-override-note').exists()).toBe(true)
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(localStorage.getItem(LS_KEY)).toBe('online')
    expect(settingsApi.put).toHaveBeenCalledWith(NS, 'sourceOverride', 'online')
    expect(dispatched).toHaveBeenCalled()
    window.removeEventListener('sentinel:sourceOverrideChanged', dispatched)
  })

  it('does nothing when the already-active option is clicked', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('[data-value="auto"]').trigger('click')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
