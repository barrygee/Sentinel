import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SeaAisSdrSourceControl from './SeaAisSdrSourceControl.vue'
import * as sdrRadiosApi from '@/services/sdrRadiosApi'
import * as settingsApi from '@/services/settingsApi'

/**
 * Settings › SEA › AIS › Off Grid SDR. The control records which radio is the
 * off-grid AIS receiver: a plain `sea.aisSdrRadioId` setting staged into APPLY
 * CHANGES. The tests guard the one thing that is easy to get wrong in this
 * shape — reading the stored value back must not look like an operator's edit
 * (that would make the panel claim unsaved changes every time it opened) — plus
 * the shape of what is finally written for a pick and for a clear.
 */

function radio(overrides: Partial<sdrRadiosApi.SdrRadioRecord> = {}): sdrRadiosApi.SdrRadioRecord {
  return {
    id: 1,
    name: 'Mast Dongle',
    host: '192.168.5.67',
    port: 1234,
    description: '',
    enabled: true,
    bandwidth: null,
    rf_gain: null,
    agc: null,
    sentry_host_id: null,
    sentry_device_id: null,
    notes: '',
    antenna: '',
    visibility: 'public',
    device_available: true,
    unavailable_reason: '',
    ...overrides,
  }
}

/**
 * Mount with the radios the backend offers and whatever `sea.aisSdrRadioId`
 * holds, then let both requests settle.
 */
async function mountControl(
  radios: sdrRadiosApi.SdrRadioRecord[],
  stored: Record<string, unknown> | null = null,
) {
  vi.spyOn(sdrRadiosApi, 'listRadios').mockResolvedValue(radios)
  vi.spyOn(settingsApi, 'getNamespace').mockResolvedValue(stored)
  const wrapper = mount(SeaAisSdrSourceControl)
  await flushPromises()
  return wrapper
}

/** Pick a row by the value the dropdown carries on it. */
async function pick(wrapper: ReturnType<typeof mount>, value: string) {
  await wrapper.get(`[data-value="${value}"]`).trigger('mousedown')
  await flushPromises()
}

/** Run whatever the control handed the panel to apply. */
async function applyStaged(wrapper: ReturnType<typeof mount>) {
  const staged = wrapper.emitted('stage')
  expect(staged, 'nothing was staged').toBeDefined()
  const apply = staged![staged!.length - 1]![0] as () => Promise<unknown> | void
  return apply()
}

beforeEach(() => {
  vi.spyOn(settingsApi, 'put').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SeaAisSdrSourceControl', () => {
  it('labels itself as the AIS receiver, with the Sea wording for "off"', async () => {
    const wrapper = await mountControl([radio()])
    expect(wrapper.get('[role="combobox"]').attributes('aria-label')).toBe('AIS receive SDR')
    expect(wrapper.get('.settings-dropdown-text').text()).toBe('Not set — no off-grid AIS receiver')
  })

  it('reads the persisted receiver out of the sea namespace', async () => {
    const wrapper = await mountControl([radio({ id: 2, name: 'Mast Dongle' })], {
      aisSdrRadioId: 2,
    })
    expect(settingsApi.getNamespace).toHaveBeenCalledWith('sea')
    expect(wrapper.find('[role="option"][aria-selected="true"]').attributes('data-value')).toBe('2')
    expect(wrapper.get('.settings-dropdown-text').text()).toBe('Mast Dongle')
  })

  it('stages nothing for reading the stored receiver back', async () => {
    // Otherwise APPLY CHANGES would light up every time the panel opened.
    const wrapper = await mountControl([radio({ id: 1 })], { aisSdrRadioId: 1 })
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('starts unset when nothing is stored', async () => {
    const wrapper = await mountControl([radio({ id: 1 })], null)
    expect(wrapper.find('[role="option"][aria-selected="true"]').exists()).toBe(false)
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('starts unset when the stored value is not a radio id', async () => {
    // A hand-edited app-config JSON can put anything here; a string must not
    // become a phantom selection.
    const wrapper = await mountControl([radio({ id: 1 })], { aisSdrRadioId: 'one' })
    expect(wrapper.find('[role="option"][aria-selected="true"]').exists()).toBe(false)
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('writes the chosen receiver as a number, and only on APPLY CHANGES', async () => {
    const wrapper = await mountControl([radio({ id: 3, name: 'Mast Dongle' })])
    await pick(wrapper, '3')
    expect(settingsApi.put).not.toHaveBeenCalled()

    await applyStaged(wrapper)
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'aisSdrRadioId', 3)
  })

  it('clears the receiver to null when the choice is turned off', async () => {
    const wrapper = await mountControl([radio({ id: 1 })], { aisSdrRadioId: 1 })
    await pick(wrapper, '')
    await applyStaged(wrapper)
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'aisSdrRadioId', null)
  })

  it('stages only the latest choice when the operator changes their mind', async () => {
    const wrapper = await mountControl([
      radio({ id: 1, name: 'Mast' }),
      radio({ id: 2, name: 'Cabin' }),
    ])
    await pick(wrapper, '1')
    await pick(wrapper, '2')
    expect(wrapper.emitted('stage')).toHaveLength(2)

    await applyStaged(wrapper)
    expect(settingsApi.put).toHaveBeenCalledExactlyOnceWith('sea', 'aisSdrRadioId', 2)
  })

  it('offers nothing but an explanation when no radio is configured', async () => {
    const wrapper = await mountControl([])
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('Add a radio under Settings → SDR first')
    expect((wrapper.get('[role="combobox"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('has no accessibility violations', async () => {
    // `region` is off: the control always renders inside the Settings panel's
    // landmark, never as a bare page fragment as it does here.
    const wrapper = await mountControl([radio({ id: 1 })], { aisSdrRadioId: 1 })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('is operable from the keyboard', async () => {
    const wrapper = await mountControl([radio({ id: 5, name: 'Mast Dongle' })])
    document.body.appendChild(wrapper.element)
    const trigger = wrapper.get('[role="combobox"]')
    ;(trigger.element as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(trigger.element)

    // First ArrowDown opens the list, the second points at the first radio.
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    await applyStaged(wrapper)
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'aisSdrRadioId', 5)
    wrapper.unmount()
  })
})
