import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import maplibregl from 'maplibre-gl'
import { AdsbLabelsToggleControl } from './AdsbLabelsToggleControl'
import { useAirStore } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'
import type { AirStore } from '../types'
import type { AdsbLiveControl } from '../adsb/AdsbLiveControl'

vi.mock('@/services/settingsApi', () => ({ put: vi.fn() }))

// Minimal stand-in for the AdsbLiveControl collaborator: only `visible` and
// `setLabelsVisible` are touched by AdsbLabelsToggleControl.
function fakeAdsbControl(visible: boolean): {
  control: AdsbLiveControl
  setLabelsVisible: ReturnType<typeof vi.fn>
} {
  const setLabelsVisible = vi.fn()
  return { control: { visible, setLabelsVisible } as unknown as AdsbLiveControl, setLabelsVisible }
}

const emptyMap = {} as unknown as maplibregl.Map

let airStore: AirStore

beforeEach(() => {
  setActivePinia(createPinia())
  airStore = useAirStore()
  vi.mocked(settingsApi.put).mockClear()
})

describe('AdsbLabelsToggleControl constructor', () => {
  it('seeds visibility from the air store (default off)', () => {
    expect(new AdsbLabelsToggleControl(airStore, null).labelsVisible).toBe(false)
  })

  it('seeds visibility as on when the store has labels enabled', () => {
    airStore.setOverlay('adsbLabels', true)
    expect(new AdsbLabelsToggleControl(airStore, null).labelsVisible).toBe(true)
  })

  it('defaults visibility to on when the overlay state is undefined', () => {
    // Real stores always define `adsbLabels`, but the constructor guards with
    // `?? true`; a store missing the key must still seed labels as visible.
    const storeWithoutOverlay = { overlayStates: {}, setOverlay: vi.fn() } as unknown as AirStore
    expect(new AdsbLabelsToggleControl(storeWithoutOverlay, null).labelsVisible).toBe(true)
  })

  it('exposes its label and title', () => {
    const control = new AdsbLabelsToggleControl(airStore, null)
    expect(control.buttonLabel).toBe('L')
    expect(control.buttonTitle).toBe('Toggle aircraft labels')
  })
})

describe('AdsbLabelsToggleControl.onInit', () => {
  it('renders active and interactive when ADS-B is on and labels are visible', () => {
    airStore.setOverlay('adsbLabels', true)
    const { control: adsb } = fakeAdsbControl(true)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    control.onAdd(emptyMap)
    expect(control.button.style.opacity).toBe('1')
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
    expect(control.button.style.pointerEvents).toBe('auto')
  })

  it('renders dimmed and non-interactive when ADS-B is off', () => {
    airStore.setOverlay('adsbLabels', true)
    const { control: adsb } = fakeAdsbControl(false)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    control.onAdd(emptyMap)
    expect(control.button.style.opacity).toBe('0.3')
    expect(control.button.style.pointerEvents).toBe('none')
  })

  it('treats a null ADS-B control as ADS-B being on', () => {
    airStore.setOverlay('adsbLabels', true)
    const control = new AdsbLabelsToggleControl(airStore, null)
    control.onAdd(emptyMap)
    expect(control.button.style.pointerEvents).toBe('auto')
    expect(control.button.style.opacity).toBe('1')
  })
})

describe('AdsbLabelsToggleControl.toggle (via click)', () => {
  it('turns labels on, pushes the state to the ADS-B control, and persists it', () => {
    const { control: adsb, setLabelsVisible } = fakeAdsbControl(true)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    control.onAdd(emptyMap)

    control.handleClickPublic()

    expect(control.labelsVisible).toBe(true)
    expect(setLabelsVisible).toHaveBeenCalledWith(true)
    expect(airStore.overlayStates.adsbLabels).toBe(true)
    expect(control.button.style.opacity).toBe('1')
  })

  it('turns labels off again on a second toggle', () => {
    airStore.setOverlay('adsbLabels', true)
    const { control: adsb, setLabelsVisible } = fakeAdsbControl(true)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    control.onAdd(emptyMap)

    control.handleClickPublic()

    expect(control.labelsVisible).toBe(false)
    expect(setLabelsVisible).toHaveBeenCalledWith(false)
    expect(airStore.overlayStates.adsbLabels).toBe(false)
    expect(control.button.style.opacity).toBe('0.3')
  })

  it('still persists the toggle when there is no ADS-B control', () => {
    const control = new AdsbLabelsToggleControl(airStore, null)
    control.onAdd(emptyMap)

    control.handleClickPublic()

    expect(control.labelsVisible).toBe(true)
    expect(airStore.overlayStates.adsbLabels).toBe(true)
  })

  it('persists each new visibility to the backend so it syncs across devices', () => {
    const { control: adsb } = fakeAdsbControl(true)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    control.onAdd(emptyMap)

    control.handleClickPublic() // default off -> on
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'labelsVisible', true)

    control.handleClickPublic() // on -> off
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'labelsVisible', false)
    expect(settingsApi.put).toHaveBeenCalledTimes(2)
  })
})

describe('AdsbLabelsToggleControl.syncToAdsb', () => {
  it('enables interaction and reasserts label visibility when ADS-B becomes visible', () => {
    airStore.setOverlay('adsbLabels', true)
    const { control: adsb, setLabelsVisible } = fakeAdsbControl(true)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    control.onAdd(emptyMap)
    setLabelsVisible.mockClear()

    control.syncToAdsb(true)

    expect(control.button.style.pointerEvents).toBe('auto')
    expect(control.button.style.opacity).toBe('1')
    expect(setLabelsVisible).toHaveBeenCalledWith(true)
  })

  it('disables interaction and does not reassert visibility when ADS-B is hidden', () => {
    airStore.setOverlay('adsbLabels', true)
    const { control: adsb, setLabelsVisible } = fakeAdsbControl(true)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    control.onAdd(emptyMap)
    setLabelsVisible.mockClear()

    control.syncToAdsb(false)

    expect(control.button.style.pointerEvents).toBe('none')
    expect(control.button.style.opacity).toBe('0.3')
    expect(setLabelsVisible).not.toHaveBeenCalled()
  })

  it('short-circuits when the button has not been created yet', () => {
    const { control: adsb, setLabelsVisible } = fakeAdsbControl(true)
    const control = new AdsbLabelsToggleControl(airStore, adsb)
    // onAdd has not run — no button, so syncToAdsb must return without touching the control.
    expect(() => control.syncToAdsb(true)).not.toThrow()
    expect(setLabelsVisible).not.toHaveBeenCalled()
  })
})
