import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, nextTick, reactive, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  KNOWN_CLUSTER_PX,
  KNOWN_TUNED_MATCH_HZ,
  SNAP_THRESHOLD_PX,
  useKnownFrequencyMarkers,
  type KnownFrequencyAnnotationHost,
  type KnownFrequencyAnnotationPlugin,
  type KnownFrequencyMarkers,
  type KnownFrequencySource,
} from './useKnownFrequencyMarkers'
import type { SdrStoredFrequency } from '../stores/sdr'

// A 1 MHz span drawn across a 1000 px data box: 1 px = 1 kHz, which keeps every
// pixel threshold below readable as a whole number of kHz.
const SPAN_START_HZ = 100_000_000
const SPAN_END_HZ = 101_000_000
const BOX_WIDTH_PX = 1000
const HZ_PER_PX = (SPAN_END_HZ - SPAN_START_HZ) / BOX_WIDTH_PX

function storedFrequency(id: number, label: string, frequencyHz: number): SdrStoredFrequency {
  return { id, group_id: null, label, frequency_hz: frequencyHz, mode: 'NFM' } as SdrStoredFrequency
}

interface Harness {
  markers: KnownFrequencyMarkers
  source: KnownFrequencySource & {
    frequencies: SdrStoredFrequency[]
    currentFreqHz: number
    snapToKnown: boolean
    displayKnownFrequencies: boolean
  }
  spanStartHz: Ref<number>
  spanEndHz: Ref<number>
  zoom: Ref<number>
  dataBoxWidthPx: Ref<number>
  wrapper: VueWrapper
}

let mounted: VueWrapper[] = []

/** Mounts the composable in a throwaway component (it registers lifecycle hooks). */
function mountMarkers(
  options: {
    frequencies?: SdrStoredFrequency[]
    currentFreqHz?: number
    snapToKnown?: boolean
    zoomWindowHz?: (lo: number, hi: number) => { winLo: number; winHi: number }
  } = {},
): Harness {
  const source = reactive({
    frequencies: options.frequencies ?? [],
    currentFreqHz: options.currentFreqHz ?? 0,
    snapToKnown: options.snapToKnown ?? true,
    displayKnownFrequencies: true,
  })
  const spanStartHz = ref(SPAN_START_HZ)
  const spanEndHz = ref(SPAN_END_HZ)
  const zoom = ref(1)
  const dataBoxWidthPx = ref(BOX_WIDTH_PX)
  const zoomWindowHz = options.zoomWindowHz ?? ((lo, hi) => ({ winLo: lo, winHi: hi }))
  let markers: KnownFrequencyMarkers | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        markers = useKnownFrequencyMarkers({
          source,
          spanStartHz,
          spanEndHz,
          zoom,
          dataBoxWidthPx,
          zoomWindowHz,
        })
        return () => null
      },
    }),
    { attachTo: document.body },
  )
  mounted.push(wrapper)
  return {
    markers: markers as KnownFrequencyMarkers,
    source,
    spanStartHz,
    spanEndHz,
    zoom,
    dataBoxWidthPx,
    wrapper,
  }
}

function fakePlot() {
  return {
    add_plugin: vi.fn(),
    remove_plugin: vi.fn(),
    redraw: vi.fn(),
  }
}

function fakePlugin(onmouseup?: EventListener) {
  const plugin: KnownFrequencyAnnotationPlugin & { clear_annotations: Mock<() => void> } = {
    clear_annotations: vi.fn<() => void>(),
  }
  if (onmouseup) plugin.onmouseup = onmouseup
  return plugin
}

/** Where a marker at `frequencyHz` lands: the carrier line's whole-pixel-plus-half column. */
function expectedLeftPct(frequencyHz: number): number {
  const leftPx = (frequencyHz - SPAN_START_HZ) / HZ_PER_PX
  return ((Math.round(leftPx) + 0.5) / BOX_WIDTH_PX) * 100
}

function markerElement(): { marker: HTMLElement; inner: HTMLElement; outside: HTMLElement } {
  const marker = document.createElement('div')
  marker.className = 'sdr-wf-known-marker'
  const inner = document.createElement('button')
  marker.appendChild(inner)
  const outside = document.createElement('div')
  document.body.append(marker, outside)
  return { marker, inner, outside }
}

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted = []
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('useKnownFrequencyMarkers — design constants', () => {
  it('merges dots closer than the 24px marker button (WCAG 2.5.8 target size)', () => {
    expect(KNOWN_CLUSTER_PX).toBe(24)
  })

  it('snaps within 12px and reads a marker as tuned within 1.5 kHz', () => {
    expect(SNAP_THRESHOLD_PX).toBe(12)
    expect(KNOWN_TUNED_MATCH_HZ).toBe(1500)
  })
})

describe('useKnownFrequencyMarkers — visibleKnownFreqs', () => {
  it.each([
    ['equal', SPAN_START_HZ],
    ['inverted', SPAN_START_HZ - 1],
  ])('is empty when the span is %s', (_case, spanEndHz) => {
    const harness = mountMarkers({ frequencies: [storedFrequency(1, 'A', SPAN_START_HZ)] })
    harness.spanEndHz.value = spanEndHz
    expect(harness.markers.visibleKnownFreqs.value).toEqual([])
  })

  it('describes a single in-window frequency as one plain marker', () => {
    const harness = mountMarkers({ frequencies: [storedFrequency(7, 'Tower', 100_500_000)] })
    expect(harness.markers.visibleKnownFreqs.value).toEqual([
      {
        key: '7',
        leftPct: expectedLeftPct(100_500_000),
        isCluster: false,
        count: 1,
        label: 'Tower',
        members: [{ id: '7', label: 'Tower', frequencyHz: 100_500_000 }],
        tunedLabel: null,
      },
    ])
  })

  it('snaps the dot to the whole pixel plus half the carrier line is drawn on', () => {
    // 0.4 px from the left edge rounds down to pixel 0, so the dot sits at 0.5 px.
    const harness = mountMarkers({ frequencies: [storedFrequency(1, 'A', SPAN_START_HZ + 400)] })
    expect(harness.markers.visibleKnownFreqs.value[0]?.leftPct).toBeCloseTo(0.05, 10)
  })

  it('keeps the window edges and drops everything outside them', () => {
    const harness = mountMarkers({
      frequencies: [
        storedFrequency(1, 'below', SPAN_START_HZ - 1),
        storedFrequency(2, 'low edge', SPAN_START_HZ),
        storedFrequency(3, 'high edge', SPAN_END_HZ),
        storedFrequency(4, 'above', SPAN_END_HZ + 1),
      ],
    })
    expect(harness.markers.visibleKnownFreqs.value.map((marker) => marker.label)).toEqual([
      'low edge',
      'high edge',
    ])
  })

  it('uses the zoom window, not the whole span', () => {
    const harness = mountMarkers({
      frequencies: [
        storedFrequency(1, 'left', 100_100_000),
        storedFrequency(2, 'right', 100_900_000),
      ],
      zoomWindowHz: (lo, hi) => ({ winLo: lo + (hi - lo) / 2, winHi: hi }),
    })
    const markers = harness.markers.visibleKnownFreqs.value
    expect(markers.map((marker) => marker.label)).toEqual(['right'])
    // Projected across the half-span window: 400 kHz into a 500 kHz window.
    expect(markers[0]?.leftPct).toBeCloseTo(((800 + 0.5) / BOX_WIDTH_PX) * 100, 10)
  })

  it('orders markers left to right whatever order the store holds them in', () => {
    const harness = mountMarkers({
      frequencies: [
        storedFrequency(1, 'right', 100_900_000),
        storedFrequency(2, 'left', 100_100_000),
      ],
    })
    expect(harness.markers.visibleKnownFreqs.value.map((marker) => marker.label)).toEqual([
      'left',
      'right',
    ])
  })

  it('merges frequencies exactly the cluster distance apart into one centred marker', () => {
    const lowHz = 100_300_000
    const highHz = lowHz + KNOWN_CLUSTER_PX * HZ_PER_PX
    const harness = mountMarkers({
      frequencies: [storedFrequency(1, 'Low', lowHz), storedFrequency(2, 'High', highHz)],
    })
    const markers = harness.markers.visibleKnownFreqs.value
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({
      key: '1-2',
      isCluster: true,
      count: 2,
      label: 'Low',
      tunedLabel: null,
      leftPct: expectedLeftPct((lowHz + highHz) / 2),
    })
    expect(markers[0]?.members.map((member) => member.label)).toEqual(['Low', 'High'])
  })

  it('keeps frequencies one pixel past the cluster distance as separate markers', () => {
    const lowHz = 100_300_000
    const highHz = lowHz + (KNOWN_CLUSTER_PX + 1) * HZ_PER_PX
    const harness = mountMarkers({
      frequencies: [storedFrequency(1, 'Low', lowHz), storedFrequency(2, 'High', highHz)],
    })
    expect(harness.markers.visibleKnownFreqs.value.map((marker) => marker.key)).toEqual(['1', '2'])
  })

  it('chains a cluster by the gap to the previous frequency, not to the first', () => {
    const stepHz = 20 * HZ_PER_PX
    const harness = mountMarkers({
      frequencies: [
        storedFrequency(1, 'A', 100_300_000),
        storedFrequency(2, 'B', 100_300_000 + stepHz),
        storedFrequency(3, 'C', 100_300_000 + 2 * stepHz),
      ],
    })
    const markers = harness.markers.visibleKnownFreqs.value
    expect(markers).toHaveLength(1)
    expect(markers[0]?.key).toBe('1-2-3')
  })

  it('names the tuned member and anchors the cluster dot on it', () => {
    const lowHz = 100_300_000
    const highHz = lowHz + 10 * HZ_PER_PX
    const harness = mountMarkers({
      frequencies: [storedFrequency(1, 'Low', lowHz), storedFrequency(2, 'High', highHz)],
      currentFreqHz: highHz + KNOWN_TUNED_MATCH_HZ,
    })
    const marker = harness.markers.visibleKnownFreqs.value[0]
    expect(marker?.tunedLabel).toBe('High')
    expect(marker?.leftPct).toBe(expectedLeftPct(highHz))
  })

  it('reads as untuned one hertz past the tuned match distance', () => {
    const harness = mountMarkers({
      frequencies: [storedFrequency(1, 'A', 100_300_000)],
      currentFreqHz: 100_300_000 - KNOWN_TUNED_MATCH_HZ - 1,
    })
    expect(harness.markers.visibleKnownFreqs.value[0]?.tunedLabel).toBeNull()
  })

  it('follows the store when frequencies are added', async () => {
    const harness = mountMarkers()
    expect(harness.markers.visibleKnownFreqs.value).toEqual([])
    harness.source.frequencies.push(storedFrequency(1, 'New', 100_500_000))
    await nextTick()
    expect(harness.markers.visibleKnownFreqs.value.map((marker) => marker.label)).toEqual(['New'])
  })
})

describe('useKnownFrequencyMarkers — popovers', () => {
  it('toggles a marker open and shut, and moves to another marker', () => {
    const { markers } = mountMarkers()
    markers.toggleKnownMarker('a')
    expect(markers.openKnownKey.value).toBe('a')
    expect(markers.isKnownPopoverShown('a')).toBe(true)
    expect(markers.isKnownPopoverShown('b')).toBe(false)
    markers.toggleKnownMarker('b')
    expect(markers.openKnownKey.value).toBe('b')
    markers.toggleKnownMarker('b')
    expect(markers.openKnownKey.value).toBeNull()
    expect(markers.isKnownPopoverShown('b')).toBe(false)
  })

  it('previews the popover while a mouse hovers and hides it on leave', () => {
    const { markers } = mountMarkers()
    markers.onKnownMarkerPointerEnter({ pointerType: 'mouse' } as PointerEvent, 'a')
    expect(markers.isKnownPopoverShown('a')).toBe(true)
    expect(markers.openKnownKey.value).toBeNull()
    markers.onKnownMarkerPointerLeave('a')
    expect(markers.isKnownPopoverShown('a')).toBe(false)
  })

  it.each(['touch', 'pen'])('does not preview on a %s pointer', (pointerType) => {
    const { markers } = mountMarkers()
    markers.onKnownMarkerPointerEnter({ pointerType } as PointerEvent, 'a')
    expect(markers.isKnownPopoverShown('a')).toBe(false)
  })

  it('ignores a pointer leaving a marker other than the hovered one', () => {
    const { markers } = mountMarkers()
    markers.onKnownMarkerPointerEnter({ pointerType: 'mouse' } as PointerEvent, 'a')
    markers.onKnownMarkerPointerLeave('b')
    expect(markers.isKnownPopoverShown('a')).toBe(true)
  })

  it('keeps a clicked-open popover after the pointer leaves', () => {
    const { markers } = mountMarkers()
    markers.onKnownMarkerPointerEnter({ pointerType: 'mouse' } as PointerEvent, 'a')
    markers.toggleKnownMarker('a')
    markers.onKnownMarkerPointerLeave('a')
    expect(markers.isKnownPopoverShown('a')).toBe(true)
  })

  it('recognises events from inside a marker only', () => {
    const { markers } = mountMarkers()
    const { marker, inner, outside } = markerElement()
    expect(markers.isKnownMarkerEvent({ target: marker } as unknown as Event)).toBe(true)
    expect(markers.isKnownMarkerEvent({ target: inner } as unknown as Event)).toBe(true)
    expect(markers.isKnownMarkerEvent({ target: outside } as unknown as Event)).toBe(false)
    expect(markers.isKnownMarkerEvent({ target: document } as unknown as Event)).toBe(false)
    expect(markers.isKnownMarkerEvent({ target: null } as unknown as Event)).toBe(false)
  })

  it('closes the open popover on a mousedown outside any marker', () => {
    const { markers } = mountMarkers()
    const { outside } = markerElement()
    markers.toggleKnownMarker('a')
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(markers.openKnownKey.value).toBeNull()
  })

  it('keeps the open popover on a mousedown inside a marker', () => {
    const { markers } = mountMarkers()
    const { inner } = markerElement()
    markers.toggleKnownMarker('a')
    inner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(markers.openKnownKey.value).toBe('a')
  })

  it('leaves the hover preview alone on an outside mousedown with nothing open', () => {
    const { markers } = mountMarkers()
    const { outside } = markerElement()
    markers.onKnownMarkerPointerEnter({ pointerType: 'mouse' } as PointerEvent, 'a')
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(markers.openKnownKey.value).toBeNull()
    expect(markers.isKnownPopoverShown('a')).toBe(true)
  })

  it('stops listening for outside clicks once unmounted', () => {
    const { markers, wrapper } = mountMarkers()
    const { outside } = markerElement()
    markers.toggleKnownMarker('a')
    wrapper.unmount()
    mounted = mounted.filter((entry) => entry !== wrapper)
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(markers.openKnownKey.value).toBe('a')
  })

  it.each<[string, (harness: Harness) => void]>([
    ['zoom', (harness) => (harness.zoom.value = 2)],
    ['span start', (harness) => (harness.spanStartHz.value = SPAN_START_HZ + 1)],
    ['span end', (harness) => (harness.spanEndHz.value = SPAN_END_HZ + 1)],
    ['marker display', (harness) => (harness.source.displayKnownFrequencies = false)],
  ])('dismisses open and hovered popovers when the %s changes', async (_case, change) => {
    const harness = mountMarkers()
    harness.markers.toggleKnownMarker('a')
    harness.markers.onKnownMarkerPointerEnter({ pointerType: 'mouse' } as PointerEvent, 'b')
    change(harness)
    await nextTick()
    expect(harness.markers.openKnownKey.value).toBeNull()
    expect(harness.markers.isKnownPopoverShown('b')).toBe(false)
  })
})

describe('useKnownFrequencyMarkers — snapToKnownFreqHz', () => {
  const knownHz = 100_500_000
  const thresholdHz = SNAP_THRESHOLD_PX * HZ_PER_PX

  it('snaps a frequency exactly the threshold away onto the known one', () => {
    const { markers } = mountMarkers({ frequencies: [storedFrequency(1, 'A', knownHz)] })
    expect(markers.snapToKnownFreqHz(knownHz + thresholdHz)).toBe(knownHz)
    expect(markers.snapToKnownFreqHz(knownHz - thresholdHz)).toBe(knownHz)
  })

  it('leaves a frequency one hertz past the threshold alone', () => {
    const { markers } = mountMarkers({ frequencies: [storedFrequency(1, 'A', knownHz)] })
    expect(markers.snapToKnownFreqHz(knownHz + thresholdHz + 1)).toBe(knownHz + thresholdHz + 1)
  })

  it('scales the threshold with the zoom window', () => {
    const { markers } = mountMarkers({
      frequencies: [storedFrequency(1, 'A', knownHz)],
      // A quarter of the span on the same box: 250 Hz per pixel.
      zoomWindowHz: () => ({ winLo: 100_375_000, winHi: 100_625_000 }),
    })
    expect(markers.snapToKnownFreqHz(knownHz + SNAP_THRESHOLD_PX * 250)).toBe(knownHz)
    expect(markers.snapToKnownFreqHz(knownHz + SNAP_THRESHOLD_PX * 250 + 1)).toBe(
      knownHz + SNAP_THRESHOLD_PX * 250 + 1,
    )
  })

  it('picks the nearest known frequency, the later one on a tie', () => {
    const { markers } = mountMarkers({
      frequencies: [
        storedFrequency(1, 'far', knownHz - 8 * HZ_PER_PX),
        storedFrequency(2, 'near', knownHz + 2 * HZ_PER_PX),
        storedFrequency(3, 'tie', knownHz - 2 * HZ_PER_PX),
      ],
    })
    expect(markers.snapToKnownFreqHz(knownHz)).toBe(knownHz - 2 * HZ_PER_PX)
    expect(markers.snapToKnownFreqHz(knownHz - 7 * HZ_PER_PX)).toBe(knownHz - 8 * HZ_PER_PX)
  })

  it('does nothing when snapping is switched off', () => {
    const { markers } = mountMarkers({
      frequencies: [storedFrequency(1, 'A', knownHz)],
      snapToKnown: false,
    })
    expect(markers.snapToKnownFreqHz(knownHz + 1)).toBe(knownHz + 1)
  })

  it('does nothing on an empty span', () => {
    const harness = mountMarkers({ frequencies: [storedFrequency(1, 'A', SPAN_START_HZ)] })
    harness.spanEndHz.value = SPAN_START_HZ
    expect(harness.markers.snapToKnownFreqHz(SPAN_START_HZ + 1)).toBe(SPAN_START_HZ + 1)
  })

  it('does nothing before the data box has a width', () => {
    const harness = mountMarkers({ frequencies: [storedFrequency(1, 'A', knownHz)] })
    harness.dataBoxWidthPx.value = 0
    expect(harness.markers.snapToKnownFreqHz(knownHz + 1)).toBe(knownHz + 1)
  })

  it('does nothing when the zoom window is empty', () => {
    const { markers } = mountMarkers({
      frequencies: [storedFrequency(1, 'A', knownHz)],
      zoomWindowHz: () => ({ winLo: knownHz, winHi: knownHz }),
    })
    expect(markers.snapToKnownFreqHz(knownHz + 1)).toBe(knownHz + 1)
  })
})

describe('useKnownFrequencyMarkers — annotation plugin', () => {
  it('adds the plugin to layer 2, clears it and redraws', () => {
    const { markers } = mountMarkers()
    const plot = fakePlot()
    const plugin = fakePlugin()
    markers.attachAnnotationPlugin(plot as unknown as KnownFrequencyAnnotationHost, plugin)
    expect(plot.add_plugin).toHaveBeenCalledWith(plugin, 2)
    expect(plugin.clear_annotations).toHaveBeenCalledTimes(1)
    expect(plot.redraw).toHaveBeenCalledTimes(1)
  })

  it.each<[string, (harness: Harness) => void]>([
    ['a frequency is edited', (harness) => (harness.source.frequencies[0]!.label = 'Renamed')],
    ['the span start moves', (harness) => (harness.spanStartHz.value = SPAN_START_HZ + 1)],
    ['the span end moves', (harness) => (harness.spanEndHz.value = SPAN_END_HZ + 1)],
  ])('clears the plugin again when %s', async (_case, change) => {
    const harness = mountMarkers({ frequencies: [storedFrequency(1, 'A', 100_500_000)] })
    const plot = fakePlot()
    const plugin = fakePlugin()
    harness.markers.attachAnnotationPlugin(plot as unknown as KnownFrequencyAnnotationHost, plugin)
    change(harness)
    await nextTick()
    expect(plugin.clear_annotations).toHaveBeenCalledTimes(2)
    expect(plot.redraw).toHaveBeenCalledTimes(2)
  })

  it('swallows a redraw that throws', () => {
    const { markers } = mountMarkers()
    const plot = fakePlot()
    plot.redraw.mockImplementation(() => {
      throw new Error('torn down')
    })
    const plugin = fakePlugin()
    expect(() =>
      markers.attachAnnotationPlugin(plot as unknown as KnownFrequencyAnnotationHost, plugin),
    ).not.toThrow()
    expect(plugin.clear_annotations).toHaveBeenCalledTimes(1)
  })

  it('has nothing to clear before a plugin is attached', async () => {
    const harness = mountMarkers({ frequencies: [storedFrequency(1, 'A', 100_500_000)] })
    harness.spanStartHz.value = SPAN_START_HZ + 1
    harness.source.frequencies[0]!.label = 'Renamed'
    await nextTick()
    // Attaching afterwards clears exactly once: nothing was queued up before.
    const plugin = fakePlugin()
    harness.markers.attachAnnotationPlugin(
      fakePlot() as unknown as KnownFrequencyAnnotationHost,
      plugin,
    )
    expect(plugin.clear_annotations).toHaveBeenCalledTimes(1)
  })

  it('removes the plugin and its leftover document mouseup listener on detach', async () => {
    const harness = mountMarkers({ frequencies: [storedFrequency(1, 'A', 100_500_000)] })
    const plot = fakePlot()
    const onmouseup = vi.fn()
    const plugin = fakePlugin(onmouseup)
    document.addEventListener('mouseup', onmouseup, false)
    harness.markers.attachAnnotationPlugin(plot as unknown as KnownFrequencyAnnotationHost, plugin)

    harness.markers.detachAnnotationPlugin()

    expect(plot.remove_plugin).toHaveBeenCalledWith(plugin)
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(onmouseup).not.toHaveBeenCalled()
    // Detached: later list and span changes no longer touch the old plugin.
    harness.source.frequencies[0]!.label = 'Renamed'
    harness.spanStartHz.value = SPAN_START_HZ + 1
    await nextTick()
    expect(plugin.clear_annotations).toHaveBeenCalledTimes(1)
    expect(plot.redraw).toHaveBeenCalledTimes(1)
  })

  it('removes no document listener when the plugin has none', () => {
    const { markers } = mountMarkers()
    const plot = fakePlot()
    markers.attachAnnotationPlugin(plot as unknown as KnownFrequencyAnnotationHost, fakePlugin())
    const removeListener = vi.spyOn(document, 'removeEventListener')
    markers.detachAnnotationPlugin()
    expect(removeListener).not.toHaveBeenCalledWith('mouseup', expect.anything(), false)
    expect(plot.remove_plugin).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when no plugin was ever attached', () => {
    const { markers } = mountMarkers()
    const removeListener = vi.spyOn(document, 'removeEventListener')
    expect(() => markers.detachAnnotationPlugin()).not.toThrow()
    expect(removeListener).not.toHaveBeenCalled()
  })

  it('still removes the plugin when detaching its document listener throws', () => {
    const { markers } = mountMarkers()
    const plot = fakePlot()
    markers.attachAnnotationPlugin(
      plot as unknown as KnownFrequencyAnnotationHost,
      fakePlugin(vi.fn()),
    )
    const removeListener = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {
      throw new Error('detached document')
    })
    expect(() => markers.detachAnnotationPlugin()).not.toThrow()
    // Restore before afterEach unmounts, which removes listeners through the same method.
    removeListener.mockRestore()
    expect(plot.remove_plugin).toHaveBeenCalledTimes(1)
  })

  it('swallows a remove_plugin that throws and still forgets the plugin', async () => {
    const harness = mountMarkers()
    const plot = fakePlot()
    plot.remove_plugin.mockImplementation(() => {
      throw new Error('already gone')
    })
    const plugin = fakePlugin()
    harness.markers.attachAnnotationPlugin(plot as unknown as KnownFrequencyAnnotationHost, plugin)
    expect(() => harness.markers.detachAnnotationPlugin()).not.toThrow()
    harness.spanStartHz.value = SPAN_START_HZ + 1
    await nextTick()
    expect(plugin.clear_annotations).toHaveBeenCalledTimes(1)
  })
})
