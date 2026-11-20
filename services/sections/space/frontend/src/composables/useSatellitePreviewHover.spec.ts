import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { useSatellitePreviewHover } from './useSatellitePreviewHover'
import type { SatelliteControl } from '../controls/satellite/SatelliteControl'

function fakeControl() {
  return { previewSatellite: vi.fn(), clearPreview: vi.fn() }
}

// Mounts the composable in a host component, so its onUnmounted hook is live.
function setup(control: ReturnType<typeof fakeControl> | null = fakeControl()) {
  let hover!: ReturnType<typeof useSatellitePreviewHover>
  const wrapper = mount(
    defineComponent({
      setup() {
        hover = useSatellitePreviewHover(() => control as unknown as SatelliteControl | null)
        return () => h('div')
      },
    }),
  )
  return { hover, wrapper, control }
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useSatellitePreviewHover', () => {
  it('previews the satellite on the map', () => {
    const { hover, control } = setup()
    hover.showPreview('25544', 'ISS (ZARYA)')
    expect(control!.previewSatellite).toHaveBeenCalledWith('25544', 'ISS (ZARYA)')
  })

  it('clears the preview 50 ms after the pointer leaves', () => {
    const { hover, control } = setup()
    hover.schedulePreviewClear()
    vi.advanceTimersByTime(49)
    expect(control!.clearPreview).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(control!.clearPreview).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending clear when the next row is entered in time', () => {
    const { hover, control } = setup()
    hover.schedulePreviewClear()
    hover.showPreview('7530', 'AO-7')
    vi.advanceTimersByTime(100)
    expect(control!.clearPreview).not.toHaveBeenCalled()
    expect(control!.previewSatellite).toHaveBeenCalledWith('7530', 'AO-7')
  })

  it('restarts the delay when the pointer leaves again', () => {
    const { hover, control } = setup()
    hover.schedulePreviewClear()
    vi.advanceTimersByTime(40)
    hover.schedulePreviewClear()
    vi.advanceTimersByTime(40)
    expect(control!.clearPreview).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10)
    expect(control!.clearPreview).toHaveBeenCalledTimes(1)
  })

  it('does nothing on the map before it has a satellite control', () => {
    const { hover } = setup(null)
    expect(() => {
      hover.showPreview('25544', 'ISS')
      hover.schedulePreviewClear()
      vi.advanceTimersByTime(50)
    }).not.toThrow()
  })

  it('drops a pending clear on unmount', () => {
    const { hover, wrapper, control } = setup()
    hover.schedulePreviewClear()
    wrapper.unmount()
    vi.advanceTimersByTime(50)
    expect(control!.clearPreview).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('unmounts cleanly with nothing pending', () => {
    const { wrapper } = setup()
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
