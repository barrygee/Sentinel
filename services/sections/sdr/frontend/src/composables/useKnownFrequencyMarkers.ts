/**
 * The waterfall's known-frequency markers: the saved (Frequency Manager)
 * frequencies drawn as dots along the top of the spectrum, their name popovers,
 * and snapping a tune onto one when it lands close by.
 *
 * Split out of `SdrWaterfall.vue` (refactor series C11). The component still
 * owns the plots and the span/zoom state; it passes those in and renders the
 * markers this returns.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import type { SdrStoredFrequency } from '../stores/sdr'

/** The marker's 24px button: dots closer than this on screen would overlap
 *  each other's targets (WCAG 2.5.8), so they merge into one marker instead. */
export const KNOWN_CLUSTER_PX = 24
/** Within this of the tuned frequency, a marker reads as "tuned". */
export const KNOWN_TUNED_MATCH_HZ = 1500
/** How close (on screen) a tune must land to a known frequency to snap onto it.
 *  Pixel-based so the snap distance feels the same at every zoom. */
export const SNAP_THRESHOLD_PX = 12

/** The CSS class of a marker's root element; events inside it belong to the marker. */
const MARKER_SELECTOR = '.sdr-wf-known-marker'

/** One saved frequency inside a marker. */
export interface KnownFreqMember {
  id: string
  label: string
  frequencyHz: number
}

/** One dot on the spectrum: a single saved frequency, or a cluster of them. */
export interface KnownFreqMarker {
  /** Stable identity: the member ids joined with `-`. */
  key: string
  /** Position across the data box, as a percentage of its width. */
  leftPct: number
  isCluster: boolean
  count: number
  /** The first member's name (the popover text for a single marker). */
  label: string
  members: KnownFreqMember[]
  /** The tuned member's name, shown as a persistent tag, or null when none is tuned. */
  tunedLabel: string | null
}

/** The parts of the SDR store the markers read. */
export interface KnownFrequencySource {
  readonly frequencies: readonly SdrStoredFrequency[]
  readonly currentFreqHz: number
  readonly snapToKnown: boolean
  readonly displayKnownFrequencies: boolean
}

/** The sigplot AnnotationPlugin, as far as the markers use it. */
export interface KnownFrequencyAnnotationPlugin {
  clear_annotations: () => void
  /** The document `mouseup` listener the plugin adds in init (and never removes). */
  onmouseup?: EventListener
}

/** The spectrum plot, as far as the annotation plugin needs it. */
export interface KnownFrequencyAnnotationHost {
  add_plugin: (plugin: never, layer: number) => void
  remove_plugin: (plugin: never) => void
  redraw: () => void
}

/** What the component hands the markers. */
export interface KnownFrequencyMarkerOptions {
  source: KnownFrequencySource
  spanStartHz: Ref<number>
  spanEndHz: Ref<number>
  zoom: Ref<number>
  /** Width of the spectrum's data box in CSS pixels; > 0 once a frame has drawn. */
  dataBoxWidthPx: Ref<number>
  /** The visible window inside the span at the current zoom (and live pan). */
  zoomWindowHz: (spanStartHz: number, spanEndHz: number) => { winLo: number; winHi: number }
}

/** What the component renders and wires the plot handlers to. */
export interface KnownFrequencyMarkers {
  visibleKnownFreqs: ComputedRef<KnownFreqMarker[]>
  /** The marker whose popover was clicked open, by key, or null. */
  openKnownKey: Ref<string | null>
  toggleKnownMarker: (key: string) => void
  onKnownMarkerPointerEnter: (event: PointerEvent, key: string) => void
  onKnownMarkerPointerLeave: (key: string) => void
  isKnownPopoverShown: (key: string) => boolean
  isKnownMarkerEvent: (event: Event) => boolean
  snapToKnownFreqHz: (frequencyHz: number) => number
  attachAnnotationPlugin: (
    plot: KnownFrequencyAnnotationHost,
    plugin: KnownFrequencyAnnotationPlugin,
  ) => void
  detachAnnotationPlugin: () => void
}

/**
 * Builds the known-frequency markers for one waterfall. Call it during the
 * component's setup: it registers a document listener and watchers.
 */
export function useKnownFrequencyMarkers(
  options: KnownFrequencyMarkerOptions,
): KnownFrequencyMarkers {
  const { source, spanStartHz, spanEndHz, zoom, dataBoxWidthPx, zoomWindowHz } = options

  // Saved frequencies inside the visible window, projected to a percentage
  // across the data box. A marker is JUST a dot at the top of the trace — no
  // label over the signal; clicking it reveals the name. Dots within
  // KNOWN_CLUSTER_PX of each other merge into ONE marker carrying every member,
  // so a dense band reads as a single dot with a count rather than a smear.
  const visibleKnownFreqs = computed<KnownFreqMarker[]>(() => {
    const spanLowHz = spanStartHz.value
    const spanHighHz = spanEndHz.value
    if (spanHighHz <= spanLowHz) return []
    const { winLo, winHi } = zoomWindowHz(spanLowHz, spanHighHz)
    const windowWidthHz = winHi - winLo
    // Clustering is a pixel question, so project onto the data box's width.
    // Whenever a marker is in-window the spectrum has had a frame, and that same
    // frame populated dataBoxWidthPx, so it is > 0 here.
    const boxWidthPx = dataBoxWidthPx.value
    const tunedHz = source.currentFreqHz

    const inWindow = source.frequencies
      .filter((frequency) => frequency.frequency_hz >= winLo && frequency.frequency_hz <= winHi)
      .sort((left, right) => left.frequency_hz - right.frequency_hz)

    // Walk left → right, opening a new group whenever the on-screen gap to the
    // previous frequency exceeds the cluster threshold.
    const groups: KnownFreqMember[][] = []
    let lastLeftPx = Number.NEGATIVE_INFINITY
    for (const frequency of inWindow) {
      const leftPx = ((frequency.frequency_hz - winLo) / windowWidthHz) * boxWidthPx
      const member: KnownFreqMember = {
        id: String(frequency.id),
        label: frequency.label,
        frequencyHz: frequency.frequency_hz,
      }
      if (groups.length === 0 || leftPx - lastLeftPx > KNOWN_CLUSTER_PX) {
        groups.push([member])
      } else {
        groups[groups.length - 1].push(member)
      }
      lastLeftPx = leftPx
    }

    return groups.map((members) => {
      const first = members[0]
      const last = members[members.length - 1]
      const centreHz = (first.frequencyHz + last.frequencyHz) / 2
      const tuned = members.find(
        (member) => Math.abs(member.frequencyHz - tunedHz) <= KNOWN_TUNED_MATCH_HZ,
      )
      // Anchor a tuned cluster on the TUNED member's own stored frequency rather
      // than the cluster's first/last midpoint — a cluster is only a display
      // grouping, and once one member is the tuned station the dot should sit
      // exactly on it (matching the carrier line drawn at that same stored
      // frequency) rather than at an average that can be a visible distance
      // away. Still a stored known-frequency value (never currentFreqHz itself),
      // so the marker's hit-box stays anchored to actual DB data.
      const positionHz = tuned ? tuned.frequencyHz : centreHz
      return {
        key: members.map((member) => member.id).join('-'),
        // sigplot draws the carrier line at a whole pixel plus half
        // (`Math.round(px) + 0.5`, sigplot.accordion.js / mx.real_to_pixel), so
        // the dot snaps to that same column — at the raw fractional position it
        // sat up to a pixel beside the line, which reads as off-centre on HiDPI.
        leftPct:
          ((Math.round(((positionHz - winLo) / windowWidthHz) * boxWidthPx) + 0.5) / boxWidthPx) *
          100,
        isCluster: members.length > 1,
        count: members.length,
        label: first.label,
        members,
        tunedLabel: tuned ? tuned.label : null,
      }
    })
  })

  // Toggled by a click / tap on the dot; dismissed by an outside click or any
  // pan / zoom / tune that could move the markers out from under it.
  const openKnownKey = ref<string | null>(null)
  function toggleKnownMarker(key: string) {
    openKnownKey.value = openKnownKey.value === key ? null : key
  }
  // Hovering previews the same popover a click opens, and pointer-out hides it
  // again — unless that marker was clicked open, which keeps it until dismissed.
  const hoveredKnownKey = ref<string | null>(null)
  function onKnownMarkerPointerEnter(event: PointerEvent, key: string) {
    // Mouse only: a touch tap also fires pointerenter, and its click already
    // toggles the popover — a hover preview there would leave it stuck open.
    if (event.pointerType === 'mouse') hoveredKnownKey.value = key
  }
  function onKnownMarkerPointerLeave(key: string) {
    if (hoveredKnownKey.value === key) hoveredKnownKey.value = null
  }
  function isKnownPopoverShown(key: string): boolean {
    return openKnownKey.value === key || hoveredKnownKey.value === key
  }
  // True when an event originated on a marker (its dot button or popover). Keeps
  // a marker press from also tuning the radio (the plot mouse/touch handlers)
  // and an in-marker click from dismissing the open popover (below).
  function isKnownMarkerEvent(event: Event): boolean {
    return event.target instanceof HTMLElement && event.target.closest(MARKER_SELECTOR) !== null
  }
  useDocumentEvent('mousedown', (event: Event) => {
    if (openKnownKey.value === null || isKnownMarkerEvent(event)) return
    openKnownKey.value = null
  })
  watch([zoom, spanStartHz, spanEndHz, () => source.displayKnownFrequencies], () => {
    openKnownKey.value = null
    hoveredKnownKey.value = null
  })

  // Snap a target frequency to the nearest known frequency when it lands within
  // SNAP_THRESHOLD_PX of that marker — so a click near a known frequency jumps
  // exactly to it, and a tuner-bar drag settles onto it. Gated by the
  // Settings › SDR "Snap to Known Frequencies" toggle.
  function snapToKnownFreqHz(frequencyHz: number): number {
    if (!source.snapToKnown) return frequencyHz
    const spanLowHz = spanStartHz.value
    const spanHighHz = spanEndHz.value
    if (spanHighHz <= spanLowHz) return frequencyHz
    const { winLo, winHi } = zoomWindowHz(spanLowHz, spanHighHz)
    const boxWidthPx = dataBoxWidthPx.value
    if (boxWidthPx <= 0 || winHi <= winLo) return frequencyHz
    const thresholdHz = SNAP_THRESHOLD_PX * ((winHi - winLo) / boxWidthPx)
    let bestHz = frequencyHz
    let bestDistanceHz = thresholdHz
    for (const frequency of source.frequencies) {
      const distanceHz = Math.abs(frequency.frequency_hz - frequencyHz)
      if (distanceHz <= bestDistanceHz) {
        bestDistanceHz = distanceHz
        bestHz = frequency.frequency_hz
      }
    }
    return bestHz
  }

  // The HTML overlay (visibleKnownFreqs) does all the drawing; the sigplot
  // AnnotationPlugin that once drew a canvas line per frequency stays attached
  // but empty (cheap, harmless), cleared whenever the list or span changes.
  let annotationHost: KnownFrequencyAnnotationHost | null = null
  let annotationPlugin: KnownFrequencyAnnotationPlugin | null = null
  function syncKnownFrequencies() {
    if (!annotationPlugin) return
    annotationPlugin.clear_annotations()
    try {
      annotationHost?.redraw()
    } catch {
      /* noop */
    }
  }
  function attachAnnotationPlugin(
    plot: KnownFrequencyAnnotationHost,
    plugin: KnownFrequencyAnnotationPlugin,
  ) {
    annotationHost = plot
    annotationPlugin = plugin
    plot.add_plugin(plugin as never, 2)
    syncKnownFrequencies()
  }
  function detachAnnotationPlugin() {
    // sigplot's AnnotationPlugin registers a document `mouseup` listener in init
    // but never removes it in dispose() — after remove_plugin() zeroes its
    // `annotations` array, the stale listener throws on the next mouseup.
    // Detach it ourselves before disposing.
    try {
      if (annotationPlugin?.onmouseup) {
        document.removeEventListener('mouseup', annotationPlugin.onmouseup, false)
      }
    } catch {
      /* noop */
    }
    try {
      if (annotationPlugin) annotationHost?.remove_plugin(annotationPlugin as never)
    } catch {
      /* noop */
    }
    annotationPlugin = null
    annotationHost = null
  }
  watch(() => source.frequencies, syncKnownFrequencies, { deep: true })
  watch([spanStartHz, spanEndHz], syncKnownFrequencies)

  return {
    visibleKnownFreqs,
    openKnownKey,
    toggleKnownMarker,
    onKnownMarkerPointerEnter,
    onKnownMarkerPointerLeave,
    isKnownPopoverShown,
    isKnownMarkerEvent,
    snapToKnownFreqHz,
    attachAnnotationPlugin,
    detachAnnotationPlugin,
  }
}
