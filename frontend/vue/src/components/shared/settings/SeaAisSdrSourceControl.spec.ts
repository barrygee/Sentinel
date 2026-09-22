import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SeaAisSdrSourceControl from './SeaAisSdrSourceControl.vue'
import * as sdrRadiosApi from '@/services/sdrRadiosApi'
import * as settingsApi from '@/services/settingsApi'
import { useSdrStore } from '@/stores/sdr'

/**
 * Settings › SEA › AIS › AIS SDR. The control records which radio is the
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
  // The control reaches for the SDR store to stop decode when the receiver is
  // cleared, so it needs a live Pinia.
  setActivePinia(createPinia())
  vi.spyOn(settingsApi, 'put').mockResolvedValue(undefined)
  // hydrateAisFromDb runs on mount; without a stub it hits the real fetch.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
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

describe('SeaAisSdrSourceControl — releasing the radio', () => {
  /**
   * Designating a receiver only records the choice (decode starts when SEA is
   * opened off grid), but CLEARING it is an immediate request for the radio
   * back — leaving it decoding would keep the dongle locked out of the SDR
   * panel for a Sea map nobody is watching.
   */
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(settingsApi, 'put').mockResolvedValue(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stops decode when the receiver is cleared while decoding', async () => {
    const wrapper = await mountControl([radio()], { aisSdrRadioId: 1 })
    const sdrStore = useSdrStore()
    sdrStore.setAisRadioId(1)
    const stopSpy = vi.spyOn(sdrStore, 'stopAis').mockResolvedValue(true)

    await pick(wrapper, '')
    await applyStaged(wrapper)

    expect(stopSpy).toHaveBeenCalledWith(1)
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'aisSdrRadioId', null)
  })

  it('reports an error when decode could not be stopped', async () => {
    // A radio that could not be released is not a saved setting, so the panel
    // must say ERROR rather than SAVED.
    const wrapper = await mountControl([radio()], { aisSdrRadioId: 1 })
    const sdrStore = useSdrStore()
    sdrStore.setAisRadioId(1)
    vi.spyOn(sdrStore, 'stopAis').mockResolvedValue(false)

    await pick(wrapper, '')
    await expect(applyStaged(wrapper)).rejects.toThrow('could not be stopped')
  })

  it('does not stop decode when nothing was decoding', async () => {
    const wrapper = await mountControl([radio()], { aisSdrRadioId: 1 })
    const sdrStore = useSdrStore()
    sdrStore.setAisRadioId(null)
    const stopSpy = vi.spyOn(sdrStore, 'stopAis').mockResolvedValue(true)

    await pick(wrapper, '')
    await applyStaged(wrapper)

    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('does not start decode when a receiver is chosen', async () => {
    // Decode begins when SEA is opened off grid, not here — naming a receiver
    // while online would tie up a dongle to duplicate the AISStream feed.
    const wrapper = await mountControl([radio()])
    const sdrStore = useSdrStore()
    const startSpy = vi.spyOn(sdrStore, 'startAis').mockResolvedValue(true)

    await pick(wrapper, '1')
    await applyStaged(wrapper)

    expect(startSpy).not.toHaveBeenCalled()
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'aisSdrRadioId', 1)
  })
})
