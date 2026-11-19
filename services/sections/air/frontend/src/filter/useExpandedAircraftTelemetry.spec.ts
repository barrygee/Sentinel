import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { SIGNAL_LOST_GRACE_MS, useExpandedAircraftTelemetry } from './useExpandedAircraftTelemetry'
import { EMPTY_AIRCRAFT_DATA, type AircraftFeature, type PlaneResult } from './airFilterTypes'

const SNAPSHOT: PlaneResult = {
  kind: 'plane',
  hex: 'aa1',
  callsign: 'BAW1',
  reg: '',
  squawk: '',
  emergency: false,
  coords: [-0.4, 51.5],
}

function feature(hex: string, altitude = 12000): AircraftFeature {
  return { properties: { hex, alt_baro: altitude }, geometry: { coordinates: [-0.4, 51.5] } }
}

// Mounts the composable in a host component, so its onUnmounted hook is live.
function setup(initialHex: string | null = 'aa1', features: AircraftFeature[] = []) {
  const hex = ref<string | null>(initialHex)
  const snapshot = ref<PlaneResult | null>(initialHex ? SNAPSHOT : null)
  const expandedPlane = computed({ get: () => hex.value, set: (value) => (hex.value = value) })
  const expandedPlaneSnapshot = computed({
    get: () => snapshot.value,
    set: (value) => (snapshot.value = value),
  })
  const aircraftFeatures = ref(features)
  let telemetry!: ReturnType<typeof useExpandedAircraftTelemetry>
  const wrapper = mount(
    defineComponent({
      setup() {
        telemetry = useExpandedAircraftTelemetry(
          expandedPlane,
          expandedPlaneSnapshot,
          aircraftFeatures,
        )
        return () => h('div')
      },
    }),
  )
  return { hex, snapshot, aircraftFeatures, telemetry, wrapper }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useExpandedAircraftTelemetry', () => {
  it('starts on the placeholder with no signal-lost flag', () => {
    const { telemetry } = setup()
    expect(telemetry.liveAircraftData.value).toEqual(EMPTY_AIRCRAFT_DATA)
    expect(telemetry.signalLost.value).toBe(false)
  })

  it('formats the expanded aircraft from the feed', () => {
    const { telemetry } = setup('aa1', [feature('zz9', 1000), feature('aa1', 12000)])
    telemetry.refreshExpandedPlane()
    expect(telemetry.liveAircraftData.value.alt).toBe('12,000 ft')
    expect(telemetry.signalLost.value).toBe(false)
  })

  it('with nothing expanded, resets to the placeholder and clears the snapshot', () => {
    const { telemetry, snapshot, hex } = setup('aa1', [feature('aa1')])
    telemetry.refreshExpandedPlane()
    hex.value = null
    telemetry.refreshExpandedPlane()
    expect(telemetry.liveAircraftData.value).toEqual(EMPTY_AIRCRAFT_DATA)
    expect(snapshot.value).toBeNull()
    expect(telemetry.signalLost.value).toBe(false)
  })

  it('keeps the last-known values and flags SIGNAL LOST when the aircraft drops out', () => {
    const { telemetry, aircraftFeatures } = setup('aa1', [feature('aa1', 9000)])
    telemetry.refreshExpandedPlane()
    aircraftFeatures.value = []
    telemetry.refreshExpandedPlane()
    expect(telemetry.signalLost.value).toBe(true)
    expect(telemetry.liveAircraftData.value.alt).toBe('9,000 ft')
  })

  it('closes the row once the grace window passes with no return', () => {
    const { telemetry, hex, snapshot } = setup('aa1', [])
    telemetry.refreshExpandedPlane()
    vi.advanceTimersByTime(SIGNAL_LOST_GRACE_MS - 1)
    expect(hex.value).toBe('aa1')
    vi.advanceTimersByTime(1)
    expect(hex.value).toBeNull()
    expect(snapshot.value).toBeNull()
    expect(telemetry.signalLost.value).toBe(false)
  })

  it('does not restart the grace window on later polls while still lost', () => {
    const { telemetry, hex } = setup('aa1', [])
    telemetry.refreshExpandedPlane()
    vi.advanceTimersByTime(SIGNAL_LOST_GRACE_MS - 1000)
    telemetry.refreshExpandedPlane()
    vi.advanceTimersByTime(1000)
    expect(hex.value).toBeNull()
  })

  it('cancels the removal when the aircraft returns in time', () => {
    const { telemetry, hex, aircraftFeatures } = setup('aa1', [])
    telemetry.refreshExpandedPlane()
    vi.advanceTimersByTime(SIGNAL_LOST_GRACE_MS - 1)
    aircraftFeatures.value = [feature('aa1')]
    telemetry.refreshExpandedPlane()
    expect(telemetry.signalLost.value).toBe(false)
    vi.advanceTimersByTime(SIGNAL_LOST_GRACE_MS * 2)
    expect(hex.value).toBe('aa1')
  })

  it('a return after several lost polls cancels the one pending removal', () => {
    const { telemetry, hex, aircraftFeatures } = setup('aa1', [])
    telemetry.refreshExpandedPlane()
    vi.advanceTimersByTime(1000)
    telemetry.refreshExpandedPlane()
    telemetry.refreshExpandedPlane()
    expect(vi.getTimerCount()).toBe(1)
    aircraftFeatures.value = [feature('aa1')]
    telemetry.refreshExpandedPlane()
    vi.advanceTimersByTime(SIGNAL_LOST_GRACE_MS * 2)
    expect(hex.value).toBe('aa1')
  })

  it('cancels a pending removal when the row is closed by hand', () => {
    const { telemetry, hex, snapshot } = setup('aa1', [])
    telemetry.refreshExpandedPlane()
    hex.value = null
    telemetry.refreshExpandedPlane()
    // A different aircraft opened meanwhile must not be closed by the old timer.
    hex.value = 'bb2'
    snapshot.value = { ...SNAPSHOT, hex: 'bb2' }
    vi.advanceTimersByTime(SIGNAL_LOST_GRACE_MS)
    expect(hex.value).toBe('bb2')
  })

  it('clears a pending removal on unmount', () => {
    const { telemetry, hex, wrapper } = setup('aa1', [])
    telemetry.refreshExpandedPlane()
    wrapper.unmount()
    vi.advanceTimersByTime(SIGNAL_LOST_GRACE_MS)
    expect(hex.value).toBe('aa1')
  })

  it('unmounts cleanly with no timer pending', () => {
    const { wrapper } = setup(null)
    expect(() => wrapper.unmount()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})
