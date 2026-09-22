import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useOffgridAisDecode } from './useOffgridAisDecode'
import { useAppStore } from '@/stores/app'
import { useSdrStore } from '@/stores/sdr'
import { useSettingsStore } from '@/stores/settings'

/**
 * Tests for running off-grid AIS decode while SEA is watching.
 *
 * The behaviour worth pinning is *when* the radio is held, because both
 * mistakes are invisible and costly: decoding while online ties up a dongle to
 * duplicate a feed already arriving from AISStream, while failing to start off
 * grid leaves the Sea map permanently empty with no error to explain it.
 *
 * The deliberate asymmetry with AIR's ADS-B claim is also pinned here —
 * navigating away must NOT stop decode, because a vessel picture is built up
 * over minutes and tearing it down would mean an empty map on every visit.
 */

/** Mount the composable in a throwaway component so lifecycle hooks run. */
function mountDecode() {
  const harness = defineComponent({
    setup() {
      return { decodeState: useOffgridAisDecode() }
    },
    template: '<div />',
  })
  return mount(harness)
}

let startSpy: ReturnType<typeof vi.spyOn>
let stopSpy: ReturnType<typeof vi.spyOn>

/** Designate a radio as SEA's off-grid AIS receiver. */
function designateReceiver(radioId: number | null) {
  const settingsStore = useSettingsStore()
  settingsStore.allSettings.sea = { ...settingsStore.allSettings.sea, aisSdrRadioId: radioId }
}

/** Pin SEA's own source override, which beats the app-wide mode. */
function setSeaOverride(override: string) {
  const settingsStore = useSettingsStore()
  settingsStore.allSettings.sea = { ...settingsStore.allSettings.sea, sourceOverride: override }
}

beforeEach(() => {
  setActivePinia(createPinia())
  const sdrStore = useSdrStore()
  startSpy = vi.spyOn(sdrStore, 'startAis').mockResolvedValue(true)
  stopSpy = vi.spyOn(sdrStore, 'stopAis').mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOffgridAisDecode', () => {
  describe('when to decode', () => {
    it('starts on mount when off grid with a designated receiver', async () => {
      useAppStore().setConnectivityMode('offgrid')
      designateReceiver(7)

      mountDecode()
      await nextTick()

      expect(startSpy).toHaveBeenCalledWith(7)
    })

    it('does not decode while online', async () => {
      // Online vessels come from AISStream; decoding then would hold a dongle
      // away from whatever else wants it to duplicate that feed.
      useAppStore().setConnectivityMode('online')
      designateReceiver(7)

      mountDecode()
      await nextTick()

      expect(startSpy).not.toHaveBeenCalled()
    })

    it('does not decode off grid when no receiver is designated', async () => {
      useAppStore().setConnectivityMode('offgrid')
      designateReceiver(null)

      mountDecode()
      await nextTick()

      expect(startSpy).not.toHaveBeenCalled()
    })

    it('ignores a non-numeric stored receiver', async () => {
      // A config JSON could carry anything; a string radio id must not become
      // a start call for radio NaN.
      useAppStore().setConnectivityMode('offgrid')
      const settingsStore = useSettingsStore()
      settingsStore.allSettings.sea = { aisSdrRadioId: 'seven' }

      mountDecode()
      await nextTick()

      expect(startSpy).not.toHaveBeenCalled()
    })

    it('decodes when the browser reports itself offline in auto mode', async () => {
      useAppStore().setConnectivityMode('auto')
      useAppStore().setOnline(false)
      designateReceiver(7)

      mountDecode()
      await nextTick()

      expect(startSpy).toHaveBeenCalledWith(7)
    })

    it('does not decode in auto mode while the browser is online', async () => {
      useAppStore().setConnectivityMode('auto')
      useAppStore().setOnline(true)
      designateReceiver(7)

      mountDecode()
      await nextTick()

      expect(startSpy).not.toHaveBeenCalled()
    })
  })

  describe("SEA's own source override", () => {
    it('decodes when SEA is pinned off grid despite a global online mode', async () => {
      useAppStore().setConnectivityMode('online')
      setSeaOverride('offgrid')
      designateReceiver(7)

      mountDecode()
      await nextTick()

      expect(startSpy).toHaveBeenCalledWith(7)
    })

    it('does not decode when SEA is pinned online despite a global off-grid mode', async () => {
      useAppStore().setConnectivityMode('offgrid')
      setSeaOverride('online')
      designateReceiver(7)

      mountDecode()
      await nextTick()

      expect(startSpy).not.toHaveBeenCalled()
    })

    it('defers to the global mode when the override is auto', async () => {
      useAppStore().setConnectivityMode('offgrid')
      setSeaOverride('auto')
      designateReceiver(7)

      mountDecode()
      await nextTick()

      expect(startSpy).toHaveBeenCalledWith(7)
    })
  })

  describe('releasing the radio', () => {
    it('keeps decoding after the view unmounts', async () => {
      // The deliberate difference from AIR's ADS-B claim: a vessel picture is
      // accumulated over minutes, so navigating away must not discard it.
      useAppStore().setConnectivityMode('offgrid')
      designateReceiver(7)
      const wrapper = mountDecode()
      await nextTick()

      wrapper.unmount()
      await nextTick()

      expect(stopSpy).not.toHaveBeenCalled()
    })

    it('stops decode when the domain goes back online', async () => {
      useAppStore().setConnectivityMode('offgrid')
      designateReceiver(7)
      mountDecode()
      await nextTick()
      useSdrStore().setAisRadioId(7)

      useAppStore().setConnectivityMode('online')
      await nextTick()

      expect(stopSpy).toHaveBeenCalledWith(7)
    })

    it('stops decode when the receiver is cleared', async () => {
      useAppStore().setConnectivityMode('offgrid')
      designateReceiver(7)
      mountDecode()
      await nextTick()
      useSdrStore().setAisRadioId(7)

      designateReceiver(null)
      await nextTick()

      expect(stopSpy).toHaveBeenCalledWith(7)
    })

    it('does not call stop when nothing is decoding', async () => {
      useAppStore().setConnectivityMode('online')
      designateReceiver(null)

      mountDecode()
      await nextTick()

      expect(stopSpy).not.toHaveBeenCalled()
    })

    it('hands decode over when the designated receiver changes', async () => {
      // One backend bridge, so starting on another radio is the handover —
      // an explicit stop first would only create a gap.
      useAppStore().setConnectivityMode('offgrid')
      designateReceiver(7)
      mountDecode()
      await nextTick()
      useSdrStore().setAisRadioId(7)

      designateReceiver(9)
      await nextTick()

      expect(startSpy).toHaveBeenLastCalledWith(9)
      expect(stopSpy).not.toHaveBeenCalled()
    })
  })

  describe('exposed state', () => {
    it('reports the off-grid mode and the designated receiver', async () => {
      useAppStore().setConnectivityMode('offgrid')
      designateReceiver(7)

      const wrapper = mountDecode()
      await nextTick()

      expect(wrapper.vm.decodeState.isOffgrid.value).toBe(true)
      expect(wrapper.vm.decodeState.designatedRadioId.value).toBe(7)
    })

    it('reports no receiver when none is designated', async () => {
      useAppStore().setConnectivityMode('online')

      const wrapper = mountDecode()
      await nextTick()

      expect(wrapper.vm.decodeState.isOffgrid.value).toBe(false)
      expect(wrapper.vm.decodeState.designatedRadioId.value).toBe(null)
    })
  })
})
