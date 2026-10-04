import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRadioSelect from './SdrRadioSelect.vue'
import * as sdrRadiosApi from '@/services/sdrRadiosApi'

/**
 * `SdrRadioSelect` is the shared "which SDR radio" dropdown behind LAND's APRS
 * receiver and SEA's AIS receiver. It owns exactly one thing — the radio list —
 * and the awkward cases are what earn the tests: a radio can be disabled,
 * unplugged or withdrawn while the panel is open, and the operator must never be
 * left with an empty control and no explanation of why. The list re-reads on a
 * timer, so the teardown paths matter too: a timer that outlives the control
 * keeps polling the backend forever.
 */

function radio(overrides: Partial<sdrRadiosApi.SdrRadioRecord> = {}): sdrRadiosApi.SdrRadioRecord {
  return {
    id: 1,
    name: 'Attic Dongle',
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

const BASE_PROPS = {
  modelValue: '',
  accessibleName: 'AIS receive SDR',
  offLabel: 'Not set — no off-grid AIS receiver',
  decodeName: 'Off-grid AIS decode',
}

/** Mount with the radio list the backend would return, and let it settle. */
async function mountSelect(
  radios: sdrRadiosApi.SdrRadioRecord[],
  props: Partial<typeof BASE_PROPS> = {},
) {
  vi.spyOn(sdrRadiosApi, 'listRadios').mockResolvedValue(radios)
  const wrapper = mount(SdrRadioSelect, { props: { ...BASE_PROPS, ...props } })
  await flushPromises()
  return wrapper
}

function optionLabels(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('[role="option"]').map((option) => option.text())
}

function triggerText(wrapper: ReturnType<typeof mount>): string {
  return wrapper.get('.settings-dropdown-text').text()
}

function hintText(wrapper: ReturnType<typeof mount>): string {
  const hint = wrapper.find('.settings-datasource-hint')
  return hint.exists() ? hint.text() : ''
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SdrRadioSelect', () => {
  it('names the dropdown, since it has no visible label of its own', async () => {
    const wrapper = await mountSelect([radio()], { accessibleName: 'APRS decode SDR' })
    expect(wrapper.get('[role="combobox"]').attributes('aria-label')).toBe('APRS decode SDR')
    expect(wrapper.get('[role="listbox"]').attributes('aria-label')).toBe('APRS decode SDR')
  })

  it('offers every enabled, available radio by name', async () => {
    const wrapper = await mountSelect([
      radio({ id: 1, name: 'Attic Dongle' }),
      radio({ id: 2, name: 'Shed Dongle' }),
    ])
    expect(optionLabels(wrapper)).toEqual(['Attic Dongle', 'Shed Dongle'])
    expect(
      wrapper.findAll('[role="option"]').map((option) => option.attributes('data-value')),
    ).toEqual(['1', '2'])
  })

  it('falls back to the radio id when a radio was saved without a name', async () => {
    const wrapper = await mountSelect([radio({ id: 7, name: '' })])
    expect(optionLabels(wrapper)).toEqual(['Radio 7'])
  })

  it('omits a disabled radio and one whose device is unavailable', async () => {
    const wrapper = await mountSelect([
      radio({ id: 1, name: 'Running' }),
      radio({ id: 2, name: 'Switched Off', enabled: false }),
      radio({ id: 3, name: 'Unplugged', device_available: false }),
    ])
    expect(optionLabels(wrapper)).toEqual(['Running'])
  })

  it('treats a radio with no availability field as available', async () => {
    // A manually-entered radio has no Sentry device behind it, so the backend
    // may omit the flag entirely — that must not hide the radio.
    const withoutFlag = radio({ id: 4, name: 'Hand Entered' })
    delete withoutFlag.device_available
    const wrapper = await mountSelect([withoutFlag])
    expect(optionLabels(wrapper)).toEqual(['Hand Entered'])
  })

  it('emits the chosen radio id upwards rather than keeping its own selection', async () => {
    const wrapper = await mountSelect([radio({ id: 2, name: 'Shed Dongle' })])
    await wrapper.get('[data-value="2"]').trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')).toEqual([['2']])
  })

  it('shows the radio the owner selected as the chosen one', async () => {
    const wrapper = await mountSelect([radio({ id: 2, name: 'Shed Dongle' })], { modelValue: '2' })
    expect(wrapper.find('[role="option"][aria-selected="true"]').attributes('data-value')).toBe('2')
    expect(triggerText(wrapper)).toBe('Shed Dongle')
  })

  describe('the "off" row', () => {
    it('is absent while nothing is chosen — there is nothing to turn off', async () => {
      const wrapper = await mountSelect([radio({ id: 1 })])
      expect(wrapper.find('[data-value=""]').exists()).toBe(false)
      expect(triggerText(wrapper)).toBe(BASE_PROPS.offLabel)
    })

    it('appears first once a radio is chosen, labelled by the owning card', async () => {
      const wrapper = await mountSelect([radio({ id: 1 })], {
        modelValue: '1',
        offLabel: 'Not set — APRS decode off',
      })
      expect(optionLabels(wrapper)[0]).toBe('Not set — APRS decode off')
      expect(wrapper.find('[data-value=""]').exists()).toBe(true)
    })
  })

  describe('a withdrawn selection', () => {
    it('stays listed, labelled, and explains what has stopped working', async () => {
      const wrapper = await mountSelect(
        [radio({ id: 1, name: 'Unplugged', device_available: false })],
        { modelValue: '1', decodeName: 'APRS decode' },
      )
      expect(optionLabels(wrapper)).toContain('Unplugged (unavailable)')
      expect(hintText(wrapper)).toBe(
        'The selected radio is no longer available. APRS decode cannot run until that is fixed, or pick another.',
      )
    })

    it('stops warning once the radio comes back', async () => {
      const listSpy = vi.spyOn(sdrRadiosApi, 'listRadios')
      listSpy.mockResolvedValue([radio({ id: 1, name: 'Unplugged', device_available: false })])
      const wrapper = mount(SdrRadioSelect, { props: { ...BASE_PROPS, modelValue: '1' } })
      await flushPromises()
      expect(hintText(wrapper)).toContain('no longer available')

      listSpy.mockResolvedValue([radio({ id: 1, name: 'Replugged' })])
      // A changed selection re-reads the list; re-selecting the same radio is
      // not a change, so drive the refresh the way the panel does — a new pick.
      await wrapper.setProps({ modelValue: '' })
      await flushPromises()
      expect(hintText(wrapper)).toBe('')
      expect(optionLabels(wrapper)).toEqual(['Replugged'])
    })

    it('re-reads the list whenever the selection changes', async () => {
      const wrapper = await mountSelect([radio({ id: 1 }), radio({ id: 2, name: 'Shed' })])
      const listSpy = vi.mocked(sdrRadiosApi.listRadios)
      listSpy.mockClear()
      await wrapper.setProps({ modelValue: '2' })
      await flushPromises()
      expect(listSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('when there is nothing to pick', () => {
    it('sends the operator to SDR settings when no radio is configured', async () => {
      const wrapper = await mountSelect([])
      expect(triggerText(wrapper)).toBe('No radios — add one in SDR settings')
      expect(hintText(wrapper)).toBe('Add a radio under Settings → SDR first; it will appear here.')
    })

    it('says so when every configured radio is disabled or unavailable', async () => {
      const wrapper = await mountSelect([radio({ enabled: false })])
      expect(triggerText(wrapper)).toBe('No enabled radios available')
      expect(hintText(wrapper)).toBe(
        'Your radios are all disabled or unavailable. Enable one under Settings → SDR.',
      )
    })

    it('treats an unreachable backend as nothing to offer, not a crash', async () => {
      vi.spyOn(sdrRadiosApi, 'listRadios').mockRejectedValue(new Error('offline'))
      const wrapper = mount(SdrRadioSelect, { props: BASE_PROPS })
      await flushPromises()
      expect(optionLabels(wrapper)).toEqual([])
      expect(hintText(wrapper)).toContain('Add a radio under Settings → SDR first')
    })

    it('disables the dropdown so there is nothing to open', async () => {
      const wrapper = await mountSelect([])
      expect((wrapper.get('[role="combobox"]').element as HTMLButtonElement).disabled).toBe(true)
    })

    it('shows no hint while a radio can be picked', async () => {
      const wrapper = await mountSelect([radio()])
      expect(wrapper.find('.settings-datasource-hint').exists()).toBe(false)
    })
  })

  describe('while loading', () => {
    it('says so and stays disabled until the first list arrives', async () => {
      let releaseList: (records: sdrRadiosApi.SdrRadioRecord[]) => void = () => {}
      vi.spyOn(sdrRadiosApi, 'listRadios').mockReturnValue(
        new Promise((resolve) => {
          releaseList = resolve
        }),
      )
      const wrapper = mount(SdrRadioSelect, { props: BASE_PROPS })
      await wrapper.vm.$nextTick()
      expect(triggerText(wrapper)).toBe('Loading…')
      expect((wrapper.get('[role="combobox"]').element as HTMLButtonElement).disabled).toBe(true)
      // No hint yet: an empty list is not yet news.
      expect(wrapper.find('.settings-datasource-hint').exists()).toBe(false)

      releaseList([radio()])
      await flushPromises()
      expect(triggerText(wrapper)).toBe(BASE_PROPS.offLabel)
      expect((wrapper.get('[role="combobox"]').element as HTMLButtonElement).disabled).toBe(false)
    })
  })

  describe('keeping the list fresh', () => {
    it('re-reads the radios every five seconds', async () => {
      vi.useFakeTimers()
      const listSpy = vi.spyOn(sdrRadiosApi, 'listRadios').mockResolvedValue([radio()])
      mount(SdrRadioSelect, { props: BASE_PROPS })
      await vi.runOnlyPendingTimersAsync()
      listSpy.mockClear()

      await vi.advanceTimersByTimeAsync(5000)
      expect(listSpy).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(5000)
      expect(listSpy).toHaveBeenCalledTimes(2)
    })

    it('stops refreshing once the control is gone', async () => {
      vi.useFakeTimers()
      const listSpy = vi.spyOn(sdrRadiosApi, 'listRadios').mockResolvedValue([radio()])
      const wrapper = mount(SdrRadioSelect, { props: BASE_PROPS })
      await vi.runOnlyPendingTimersAsync()
      wrapper.unmount()
      listSpy.mockClear()

      await vi.advanceTimersByTimeAsync(15000)
      expect(listSpy).not.toHaveBeenCalled()
    })

    it('never starts a timer when it is unmounted mid-load', async () => {
      // The initial load awaits its request; unmounting inside that window runs
      // the teardown first, so there is nothing left to clear a later timer.
      vi.useFakeTimers()
      const listSpy = vi.spyOn(sdrRadiosApi, 'listRadios').mockResolvedValue([radio()])
      const wrapper = mount(SdrRadioSelect, { props: BASE_PROPS })
      wrapper.unmount()
      await vi.runOnlyPendingTimersAsync()
      listSpy.mockClear()

      await vi.advanceTimersByTimeAsync(15000)
      expect(listSpy).not.toHaveBeenCalled()
    })
  })

  it('has no accessibility violations, with a radio chosen or withdrawn', async () => {
    // `region` is off: the control always renders inside the Settings panel's
    // landmark, never as a bare page fragment as it does here.
    const axeOptions = { rules: { region: { enabled: false } } }
    const chosen = await mountSelect([radio({ id: 1 })], { modelValue: '1' })
    expect(await axe(chosen.html(), axeOptions)).toHaveNoViolations()

    const withdrawn = await mountSelect([radio({ id: 1, device_available: false })], {
      modelValue: '1',
    })
    expect(await axe(withdrawn.html(), axeOptions)).toHaveNoViolations()
  })

  it('is reachable and operable from the keyboard', async () => {
    const wrapper = await mountSelect([radio({ id: 1, name: 'Attic Dongle' })])
    document.body.appendChild(wrapper.element)
    const trigger = wrapper.get('[role="combobox"]')
    const element = trigger.element as HTMLButtonElement
    element.focus()
    expect(document.activeElement).toBe(element)
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(trigger.attributes('aria-expanded')).toBe('true')
    // The first ArrowDown only opens the list (nothing is chosen yet, so there
    // is no active option); the second points at the first radio.
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['1']])
    wrapper.unmount()
  })
})
