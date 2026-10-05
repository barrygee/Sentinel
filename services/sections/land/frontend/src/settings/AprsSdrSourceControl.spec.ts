import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'

import AprsSdrSourceControl from './AprsSdrSourceControl.vue'
import { provideFakeRadio } from '@sentinel/shell-api/testing/fakeRadio'
import type { RadioSummary } from '@sentinel/shell-api/shell/radioCapability'

/**
 * Tests for choosing which radio decodes APRS.
 *
 * The consequences here are hardware ones: the choice starts and stops a decode
 * bridge on a real dongle, and it reserves that dongle away from the SDR panel.
 * So the tests care about *when* that happens (staged, on APPLY CHANGES — never
 * as a side effect of the control reading back what the backend already had),
 * about a refusal being reported rather than swallowed, and about an operator
 * always being able to tell why a list is empty.
 */

// Radios and decoders come from the `radio` capability (F10) — a fake here.
function radio(overrides: Partial<RadioSummary> = {}): RadioSummary {
  return { id: 1, name: 'Attic Dongle', enabled: true, available: true, ...overrides }
}

let fakeRadio: ReturnType<typeof provideFakeRadio>

/** Mount with the radio list the backend would return, and let it settle. */
async function mountControl(radios: RadioSummary[]) {
  fakeRadio.listRadios.mockResolvedValue(radios)
  const wrapper = mount(AprsSdrSourceControl)
  await flushPromises()
  return wrapper
}

/** Pick a row by the value the dropdown carries on it. */
async function pick(wrapper: ReturnType<typeof mount>, value: string) {
  await wrapper.find(`[data-value="${value}"]`).trigger('mousedown')
  await flushPromises()
}

/** Run whatever the control handed the panel to apply. */
async function applyStaged(wrapper: ReturnType<typeof mount>) {
  const staged = wrapper.emitted('stage')
  const apply = staged![staged!.length - 1]![0] as () => Promise<unknown>
  return apply()
}

/** Have the radio platform report which radio APRS decode runs on. */
function persistAprsRadio(radioId: number | null) {
  fakeRadio.state.activeDecoders.aprs = radioId
}

function optionLabels(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[role="option"]').map((option) => option.text())
}

beforeEach(() => {
  // Nothing decoding unless a test calls persistAprsRadio().
  fakeRadio = provideFakeRadio()
})

afterEach(() => {
  fakeRadio.withdraw()
  vi.restoreAllMocks()
})

describe('AprsSdrSourceControl', () => {
  it('offers every enabled, available radio', async () => {
    const wrapper = await mountControl([
      radio({ id: 1, name: 'Attic Dongle' }),
      radio({ id: 2, name: 'Shed Dongle' }),
    ])

    expect(optionLabels(wrapper)).toEqual(['Attic Dongle', 'Shed Dongle'])
  })

  it('falls back to the radio id when a radio has no name', async () => {
    const wrapper = await mountControl([radio({ id: 4, name: '' })])
    expect(optionLabels(wrapper)).toEqual(['Radio 4'])
  })

  it('omits a disabled radio', async () => {
    const wrapper = await mountControl([
      radio({ id: 1, name: 'Running' }),
      radio({ id: 2, name: 'Switched Off', enabled: false }),
    ])

    expect(optionLabels(wrapper)).toEqual(['Running'])
  })

  it('omits a radio whose Sentry device is unavailable', async () => {
    const wrapper = await mountControl([
      radio({ id: 1, name: 'Present' }),
      radio({ id: 2, name: 'Unplugged', available: false }),
    ])

    expect(optionLabels(wrapper)).toEqual(['Present'])
  })

  it('survives a radio list that cannot be fetched', async () => {
    fakeRadio.listRadios.mockRejectedValue(new Error('offline'))
    const wrapper = mount(AprsSdrSourceControl)
    await flushPromises()

    expect(optionLabels(wrapper)).toEqual([])
    expect(wrapper.text()).toContain('Add a radio under Settings → SDR first')
  })

  describe('the chosen radio', () => {
    it('pre-selects the radio the backend says is decoding, after re-reading it', async () => {
      const wrapper = await mountControl([radio({ id: 2, name: 'Shed Dongle' })])
      expect(fakeRadio.decoders.refresh).toHaveBeenCalledWith('aprs')
      expect(wrapper.find('[role="option"][aria-selected="true"]').exists()).toBe(false)

      persistAprsRadio(2)
      const remounted = await mountControl([radio({ id: 2, name: 'Shed Dongle' })])
      expect(remounted.find('[role="option"][aria-selected="true"]').attributes('data-value')).toBe(
        '2',
      )
    })

    it('stages nothing when it is only reading back what is already decoding', async () => {
      persistAprsRadio(1)
      const wrapper = await mountControl([radio({ id: 1 })])

      expect(wrapper.emitted('stage')).toBeUndefined()
    })

    it('keeps a withdrawn radio listed, labelled, and explains it', async () => {
      persistAprsRadio(1)
      const wrapper = await mountControl([radio({ id: 1, name: 'Unplugged', available: false })])

      expect(optionLabels(wrapper)).toContain('Unplugged (unavailable)')
      expect(wrapper.text()).toContain('no longer available')
    })

    it('offers a way to turn decode off once one is chosen', async () => {
      persistAprsRadio(1)
      const wrapper = await mountControl([radio({ id: 1 })])

      expect(optionLabels(wrapper)[0]).toBe('Not set — APRS decode off')
    })

    it('has no "off" row while nothing is chosen', async () => {
      const wrapper = await mountControl([radio({ id: 1 })])
      expect(wrapper.find('[data-value=""]').exists()).toBe(false)
    })
  })

  describe('applying a choice', () => {
    it('starts decode on APPLY CHANGES, not on the pick itself', async () => {
      const wrapper = await mountControl([radio({ id: 3, name: 'Shed Dongle' })])

      await pick(wrapper, '3')
      expect(fakeRadio.decoders.start).not.toHaveBeenCalled()

      await applyStaged(wrapper)
      expect(fakeRadio.decoders.start).toHaveBeenCalledWith('aprs', 3)
    })

    it('reports a refusal so the panel does not claim it saved', async () => {
      const wrapper = await mountControl([radio({ id: 3 })])
      fakeRadio.decoders.start.mockResolvedValue(false)

      await pick(wrapper, '3')
      await expect(applyStaged(wrapper)).rejects.toThrow('could not be started')
    })

    it('stops decode when the choice is cleared', async () => {
      persistAprsRadio(1)
      const wrapper = await mountControl([radio({ id: 1 })])

      await pick(wrapper, '')
      await applyStaged(wrapper)

      expect(fakeRadio.decoders.stop).toHaveBeenCalledWith('aprs', 1)
    })

    it('reports a refusal to stop', async () => {
      persistAprsRadio(1)
      const wrapper = await mountControl([radio({ id: 1 })])
      fakeRadio.decoders.stop.mockResolvedValue(false)

      await pick(wrapper, '')
      await expect(applyStaged(wrapper)).rejects.toThrow('could not be stopped')
    })

    it('does nothing to stop decode that was never running', async () => {
      // Reachable by picking a radio and then the "off" row before applying.
      const wrapper = await mountControl([radio({ id: 1 })])

      await pick(wrapper, '1')
      await pick(wrapper, '')
      await applyStaged(wrapper)

      expect(fakeRadio.decoders.stop).not.toHaveBeenCalled()
    })

    it('hands decode over without stopping the previous radio first', async () => {
      // The backend runs a single bridge, so starting elsewhere is the handover.
      persistAprsRadio(1)
      const wrapper = await mountControl([radio({ id: 1 }), radio({ id: 2, name: 'Shed' })])

      await pick(wrapper, '2')
      await applyStaged(wrapper)

      expect(fakeRadio.decoders.start).toHaveBeenCalledWith('aprs', 2)
      expect(fakeRadio.decoders.stop).not.toHaveBeenCalled()
    })
  })

  describe('with no section providing a radio', () => {
    it('shows nothing chosen, and refuses to apply a choice', async () => {
      const wrapper = await mountControl([radio({ id: 3 })])
      await pick(wrapper, '3')
      fakeRadio.withdraw()

      await expect(applyStaged(wrapper)).rejects.toThrow('No radio platform')
    })

    it('mounts without a radio platform at all', async () => {
      fakeRadio.withdraw()
      const wrapper = mount(AprsSdrSourceControl)
      await flushPromises()
      expect(wrapper.find('[role="option"][aria-selected="true"]').exists()).toBe(false)
    })
  })

  describe('when there is nothing to pick', () => {
    it('sends the operator to SDR settings when no radios exist', async () => {
      const wrapper = await mountControl([])

      expect(wrapper.text()).toContain('Add a radio under Settings → SDR first')
      expect(wrapper.find('.settings-dropdown-text').text()).toBe(
        'No radios — add one in SDR settings',
      )
    })

    it('says so when every radio is disabled or unavailable', async () => {
      const wrapper = await mountControl([radio({ enabled: false })])

      expect(wrapper.text()).toContain('all disabled or unavailable')
      expect(wrapper.find('.settings-dropdown-text').text()).toBe('No enabled radios available')
    })

    it('disables the dropdown when it has nothing to offer', async () => {
      const wrapper = await mountControl([])
      expect((wrapper.find('[role="combobox"]').element as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('keeping the list fresh', () => {
    it('re-reads the radios on a timer', async () => {
      vi.useFakeTimers()
      const listSpy = fakeRadio.listRadios.mockResolvedValue([radio()])
      mount(AprsSdrSourceControl)
      await vi.runOnlyPendingTimersAsync()
      listSpy.mockClear()

      await vi.advanceTimersByTimeAsync(5000)
      expect(listSpy).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it('stops refreshing once unmounted', async () => {
      vi.useFakeTimers()
      const listSpy = fakeRadio.listRadios.mockResolvedValue([radio()])
      const wrapper = mount(AprsSdrSourceControl)
      await vi.runOnlyPendingTimersAsync()
      wrapper.unmount()
      listSpy.mockClear()

      await vi.advanceTimersByTimeAsync(15000)
      expect(listSpy).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('never starts a timer when it is unmounted mid-load', async () => {
      // onMounted awaits two requests; unmounting inside that window runs the
      // teardown first, leaving nothing to clear a timer created afterwards.
      vi.useFakeTimers()
      const listSpy = fakeRadio.listRadios.mockResolvedValue([radio()])
      const wrapper = mount(AprsSdrSourceControl)
      wrapper.unmount()
      await vi.runOnlyPendingTimersAsync()
      listSpy.mockClear()

      await vi.advanceTimersByTimeAsync(15000)
      expect(listSpy).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  it('has no accessibility violations', async () => {
    // `region` is disabled: the control always renders inside the Settings
    // panel's landmark, never as a bare page fragment like this.
    const wrapper = await mountControl([radio()])
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
