import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { useLiveSatelliteTelemetry } from './useLiveSatelliteTelemetry'

const POSITION = { alt_km: 418.2, velocity_kms: 7.66, track_deg: 51, lat: 54.9, lon: -1.6 }

function sendPosition(noradId: string, position: Record<string, number>) {
  document.dispatchEvent(new CustomEvent('sat-position-update', { detail: { noradId, position } }))
}

// Mounts the composable in a host component, so its document listener is live.
function setup(isExpandedSatellite = vi.fn((noradId: string) => noradId === '25544')) {
  let live!: ReturnType<typeof useLiveSatelliteTelemetry>
  const wrapper = mount(
    defineComponent({
      setup() {
        live = useLiveSatelliteTelemetry(isExpandedSatellite)
        return () => h('div')
      },
    }),
  )
  return { live, wrapper, isExpandedSatellite }
}

enableAutoUnmount(afterEach)

describe('useLiveSatelliteTelemetry', () => {
  it('starts empty, with no look-angles', () => {
    const { live } = setup()
    expect(live.telemetry.value).toEqual({})
    expect(live.liveAzEl.value).toBeNull()
  })

  it("formats the expanded satellite's position and keeps its look-angles", () => {
    const { live, isExpandedSatellite } = setup()
    sendPosition('25544', { ...POSITION, az: 120.5, el: 33.1 })
    expect(isExpandedSatellite).toHaveBeenCalledWith('25544')
    expect(live.telemetry.value).toEqual({
      alt: '418.2 km',
      vel: '7.66 km/s',
      hdg: '51°',
      lat: '54.9°',
      lon: '-1.6°',
    })
    expect(live.liveAzEl.value).toEqual({ az: 120.5, el: 33.1 })
  })

  it('keeps zero look-angles (a satellite on the horizon due north)', () => {
    const { live } = setup()
    sendPosition('25544', { ...POSITION, az: 0, el: 0 })
    expect(live.liveAzEl.value).toEqual({ az: 0, el: 0 })
  })

  it('drops the look-angles when an update carries only one of them, or neither', () => {
    const { live } = setup()
    sendPosition('25544', { ...POSITION, az: 120, el: 30 })
    sendPosition('25544', { ...POSITION, az: 120 })
    expect(live.liveAzEl.value).toBeNull()
    sendPosition('25544', { ...POSITION, el: 30 })
    expect(live.liveAzEl.value).toBeNull()
    sendPosition('25544', POSITION)
    expect(live.liveAzEl.value).toBeNull()
    expect(live.telemetry.value['alt']).toBe('418.2 km')
  })

  it('ignores updates for any other satellite', () => {
    const { live } = setup()
    sendPosition('7530', { ...POSITION, az: 1, el: 2 })
    expect(live.telemetry.value).toEqual({})
    expect(live.liveAzEl.value).toBeNull()
  })

  it('reset forgets the fields and look-angles', () => {
    const { live } = setup()
    sendPosition('25544', { ...POSITION, az: 1, el: 2 })
    live.reset()
    expect(live.telemetry.value).toEqual({})
    expect(live.liveAzEl.value).toBeNull()
  })

  it('stops listening once unmounted', () => {
    const { live, wrapper, isExpandedSatellite } = setup()
    wrapper.unmount()
    sendPosition('25544', POSITION)
    expect(isExpandedSatellite).not.toHaveBeenCalled()
    expect(live.telemetry.value).toEqual({})
  })
})
