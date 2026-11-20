import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { provideFakeRadio } from '@sentinel/shell-api/testing/fakeRadio'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { useRepeaterFrequencyActions } from './useRepeaterFrequencyActions'
import { REPEATER_LOCATE_EVENT } from '../controls/repeaters/RepeatersControl'
import type { RepeaterChannel, RepeaterStation } from '../types/repeaters'

enableAutoUnmount(afterEach)

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1,
    band: '2M',
    channel: 'RV52',
    txMhz: 145.65,
    rxMhz: 145.05,
    modes: ['A'],
    ctcssHz: 118.8,
    dmrColourCode: null,
    heightMagl: 30,
    erpDbw: 10,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

function repeater(overrides: Partial<RepeaterStation> = {}): RepeaterStation {
  return {
    callsign: 'GB3NM',
    latitude: 54.9,
    longitude: -1.6,
    locator: 'IO94FX',
    location: 'NEWCASTLE',
    postcode: 'NE1',
    region: 'NE',
    keeper: 'G0ABC',
    channels: [channel()],
    ...overrides,
  }
}

// Mounts the composable in a host component, so its onMounted hook runs.
function setup(): ReturnType<typeof useRepeaterFrequencyActions> {
  let actions!: ReturnType<typeof useRepeaterFrequencyActions>
  mount(
    defineComponent({
      setup() {
        actions = useRepeaterFrequencyActions()
        return () => h('div')
      },
    }),
  )
  return actions
}

describe('useRepeaterFrequencyActions', () => {
  let notificationsStore: ReturnType<typeof useNotificationsStore>
  let addNotification: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    notificationsStore = useNotificationsStore()
    addNotification = vi.spyOn(notificationsStore, 'add')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('with an SDR section providing the radio', () => {
    let radio: ReturnType<typeof provideFakeRadio>

    beforeEach(() => {
      radio = provideFakeRadio({ connected: true, storedHz: [145_650_000] })
    })
    afterEach(() => {
      radio.withdraw()
    })

    it('loads the Frequency Manager list once on mount, so bookmarks start right', () => {
      setup()
      expect(radio.frequencies.ensureLoaded).toHaveBeenCalledTimes(1)
    })

    it('reports a frequency as saved only when the manager holds it, in hertz', () => {
      const { isFrequencySaved } = setup()
      expect(isFrequencySaved(145.65)).toBe(true)
      expect(isFrequencySaved(145.05)).toBe(false)
      expect(radio.frequencies.has).toHaveBeenCalledWith(145_650_000)
    })

    it('mirrors whether the SDR is connected', () => {
      const { radioConnected } = setup()
      expect(radioConnected.value).toBe(true)
      radio.state.connected = false
      expect(radioConnected.value).toBe(false)
    })

    describe('tuneRepeater', () => {
      it("tunes an FM channel's output with digital decode off and says so", () => {
        const { tuneRepeater, tuneNotice } = setup()
        tuneNotice.value = 'rpt:GB3NM'
        tuneRepeater(repeater(), channel(), 'output')
        expect(radio.tune).toHaveBeenCalledWith({
          hz: 145_650_000,
          mode: 'NFM',
          satName: 'GB3NM 2M output',
          digital: false,
        })
        expect(tuneNotice.value).toBeNull()
        expect(addNotification).toHaveBeenCalledWith({
          type: 'system',
          title: 'GB3NM 2M OUTPUT',
          detail: 'Tuned 145.6500 MHz NFM',
        })
      })

      it("tunes a digital channel's input with digital decode on", () => {
        const { tuneRepeater } = setup()
        tuneRepeater(repeater(), channel({ modes: ['A', 'M'] }), 'input')
        expect(radio.tune).toHaveBeenCalledWith({
          hz: 145_050_000,
          mode: 'NFM',
          satName: 'GB3NM 2M input',
          digital: true,
        })
        expect(addNotification).toHaveBeenCalledWith({
          type: 'system',
          title: 'GB3NM 2M INPUT',
          detail: 'Tuned 145.0500 MHz NFM · digital decode on',
        })
      })

      it('shows the connect-an-SDR hint on that row instead of tuning while disconnected', () => {
        radio.state.connected = false
        const { tuneRepeater, tuneNotice } = setup()
        tuneRepeater(repeater(), channel(), 'output')
        expect(tuneNotice.value).toBe('rpt:GB3NM')
        expect(radio.tune).not.toHaveBeenCalled()
        expect(addNotification).not.toHaveBeenCalled()
      })
    })

    describe('saveRepeaterFrequency', () => {
      it('files the output under the Repeaters group with its town, modes, access and source', async () => {
        const { saveRepeaterFrequency } = setup()
        await saveRepeaterFrequency(repeater(), channel(), 'output')
        expect(radio.frequencies.ensureGroup).toHaveBeenCalledWith('Repeaters')
        expect(radio.frequencies.save).toHaveBeenCalledWith({
          label: 'GB3NM 2M OUT',
          frequency_hz: 145_650_000,
          mode: 'NFM',
          notes: 'NEWCASTLE · FM · Access 118.8 Hz · ukrepeater.net (RSGB ETCC)',
          group_ids: [1],
        })
        expect(addNotification).toHaveBeenCalledWith({
          type: 'system',
          title: 'GB3NM 2M OUT',
          detail: 'Saved 145.6500 MHz NFM to the frequency manager',
        })
      })

      it('saves the input, leaving out a withheld town and an empty access code', async () => {
        const { saveRepeaterFrequency } = setup()
        await saveRepeaterFrequency(
          repeater({ location: null }),
          channel({ ctcssHz: null, dmrColourCode: null }),
          'input',
        )
        expect(radio.frequencies.save).toHaveBeenCalledWith(
          expect.objectContaining({
            label: 'GB3NM 2M IN',
            frequency_hz: 145_050_000,
            notes: 'FM · ukrepeater.net (RSGB ETCC)',
          }),
        )
      })

      it('reports a failed save instead of claiming success', async () => {
        radio.frequencies.save.mockRejectedValueOnce(new Error('offline'))
        const { saveRepeaterFrequency } = setup()
        await saveRepeaterFrequency(repeater(), channel(), 'output')
        expect(addNotification).toHaveBeenCalledTimes(1)
        expect(addNotification).toHaveBeenCalledWith({
          type: 'system',
          title: 'GB3NM 2M OUT',
          detail: 'Could not save the frequency — is the backend reachable?',
        })
      })
    })

    describe('removeRepeaterFrequency', () => {
      it("removes the side's frequency and says so", async () => {
        const { removeRepeaterFrequency } = setup()
        await removeRepeaterFrequency(repeater(), channel(), 'input')
        expect(radio.frequencies.remove).toHaveBeenCalledWith(145_050_000)
        expect(addNotification).toHaveBeenCalledWith({
          type: 'system',
          title: 'GB3NM 2M IN',
          detail: 'Removed 145.0500 MHz from the frequency manager',
        })
      })

      it('reports a failed removal instead of claiming success', async () => {
        radio.frequencies.remove.mockRejectedValueOnce(new Error('offline'))
        const { removeRepeaterFrequency } = setup()
        await removeRepeaterFrequency(repeater(), channel(), 'output')
        expect(addNotification).toHaveBeenCalledTimes(1)
        expect(addNotification).toHaveBeenCalledWith({
          type: 'system',
          title: 'GB3NM 2M OUT',
          detail: 'Could not remove the frequency — is the backend reachable?',
        })
      })
    })
  })

  describe('with no SDR section deployed', () => {
    it('mounts without loading anything', () => {
      expect(() => setup()).not.toThrow()
    })

    it('reports nothing as saved', () => {
      expect(setup().isFrequencySaved(145.65)).toBe(false)
    })

    it('shows the connect-an-SDR hint rather than tuning', () => {
      const { tuneRepeater, tuneNotice } = setup()
      tuneRepeater(repeater(), channel(), 'output')
      expect(tuneNotice.value).toBe('rpt:GB3NM')
      expect(addNotification).not.toHaveBeenCalled()
    })

    it('reports a save as failed, the same as an unreachable backend', async () => {
      await setup().saveRepeaterFrequency(repeater(), channel(), 'output')
      await flushPromises()
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'Could not save the frequency — is the backend reachable?',
        }),
      )
    })

    it('reports a removal as failed, the same as an unreachable backend', async () => {
      await setup().removeRepeaterFrequency(repeater(), channel(), 'output')
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'Could not remove the frequency — is the backend reachable?',
        }),
      )
    })
  })

  describe('locateRepeater', () => {
    it('asks the map to fly to the repeater by callsign', () => {
      const listener = vi.fn()
      document.addEventListener(REPEATER_LOCATE_EVENT, listener)
      setup().locateRepeater('GB3NM')
      document.removeEventListener(REPEATER_LOCATE_EVENT, listener)
      expect(listener).toHaveBeenCalledTimes(1)
      expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ callsign: 'GB3NM' })
    })
  })
})
