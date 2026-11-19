<script setup lang="ts">
import './SdrWaterfall.css'
// Applies the sigplot axis patches (mx.drawaxis / mx.text) once, app-wide.
import './sigplotAxisPatches'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useSdrStore } from './stores/sdr'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { useSignalMarkers } from './composables/useSignalMarkers'
import { useFrequencyDrag } from './composables/useFrequencyDrag'
import { useBandwidthBracketDrag } from './composables/useBandwidthBracketDrag'
import { useKnownFrequencyMarkers } from './composables/useKnownFrequencyMarkers'
import { useWaterfallViewRange } from './composables/useWaterfallViewRange'
import { useWaterfallDataBox } from './composables/useWaterfallDataBox'
import { useWaterfallPlots, WF_ROWS } from './composables/useWaterfallPlots'
import { createWaterfallPlotHandles } from './waterfallPlotHandles'
import { layoutFrequencyTicks } from './waterfallFrequencyTicks'
import { fitBandLabel } from './bandLabel'
import SdrWaterfallSearchOverlay from './SdrWaterfallSearchOverlay.vue'
import SdrWaterfallViewSliders from './SdrWaterfallViewSliders.vue'
import SdrBandPlanOverlay from './SdrBandPlanOverlay.vue'
import SdrFrequencyTickGutter from './SdrFrequencyTickGutter.vue'
import SdrKnownFrequencyMarkers from './SdrKnownFrequencyMarkers.vue'
import SdrWaterfallTimeOverlay from './SdrWaterfallTimeOverlay.vue'

const store = useSdrStore()
const settings = useSettingsStore()

// True while EITHER a frequency-range search OR a group scan is sweeping. The
// spectrum/waterfall and the Zoom/Max/Min sliders drop to the same disabled
// dark state as when the radio isn't playing, with the info box floating above.
const sweeping = computed(() => store.searchSweeping || store.scanSweeping)

// ── RF band plan ─────────────────────────────────────────────────────────────
// Reference allocations used to label the spectrum (e.g. "Medium Wave"). Sourced
// from the sdr.bandPlan config setting (seeded from backend/default_config.json).
interface RfBand {
  name: string
  startHz: number
  endHz: number
}
const bandPlan = computed<RfBand[]>(() => settings.getSetting<RfBand[]>('sdr', 'bandPlan', []))

// Live frequency span of the current spectrum frame (center ± sample_rate/2),
// tracked so the axis scaling and the band overlay follow tuning.
const spanStartHz = ref(0)
const spanEndHz = ref(0)

// The spectrum's measured data box and the overlay styles derived from it
// (composables/useWaterfallDataBox.ts).
const {
  bandInsetLeftPx,
  bandInsetRightPx,
  bandInsetBottomPx,
  dataBoxWidthPx,
  bandOverlayStyle,
  spectrumStyle,
  rasterStyle,
  tickGutterStyle,
  knownFreqOverlayStyle,
  measure: measureSpectrumDataBox,
} = useWaterfallDataBox()

// ── Layout: track the SDR side panel open/closed state ───────────────────────
function _readSidebarOpen(): boolean {
  try {
    return sessionStorage.getItem('sentinel_sidebar_open') === '1'
  } catch {
    return false
  }
}
const panelOpen = ref<boolean>(_readSidebarOpen())
useDocumentEvent('sentinel:sidebar-state', (e: Event) => {
  panelOpen.value = !!(e as CustomEvent<{ open: boolean }>).detail?.open
})

// Pull the overlay-visibility flags from the DB whenever a config JSON upload
// replaces them, so the waterfall reacts even when the settings panel isn't
// mounted (the toggle controls also subscribe, but only while rendered).
useDocumentEvent('sentinel:config-uploaded', () => {
  void store.hydrateSnapToKnownFromDb()
  void store.hydrateDisplayBandPlanFromDb()
  void store.hydrateDisplayKnownFrequenciesFromDb()
  void store.hydrateDisplayWaterfallTimestampsFromDb()
  void store.hydrateWaterfallTimestampIntervalFromDb()
})

// ── Plots, zoom and dB range ─────────────────────────────────────────────────
// The two sigplot plots and their frequency scale, shared (non-reactively) by
// every composable below; useWaterfallPlots fills them once layout settles.
const plots = createWaterfallPlotHandles()

// Zoom, the live drag-pan offset and the Min/Max dB range, with the functions
// that push them onto the plots (composables/useWaterfallViewRange.ts).
const {
  zoom,
  livePanOffsetHz,
  zmin,
  zmax,
  autoScale,
  zoomWindowHz,
  applyZoom,
  applySpecRange,
  clampSliderCollision,
} = useWaterfallViewRange({ source: store, plots, spanStartHz, spanEndHz })

// Known-frequency markers: the dots along the top of the spectrum, their name
// popovers and snap-to-known tuning (composables/useKnownFrequencyMarkers.ts).
const {
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
} = useKnownFrequencyMarkers({
  source: store,
  spanStartHz,
  spanEndHz,
  zoom,
  dataBoxWidthPx,
  zoomWindowHz,
})

// Bands that intersect the visible (zoom-aware) frequency window, each with
// its position as a 0..100% fraction across the plot's data area. Consumed
// by the HTML band overlay in the template — coloured rectangles sit on the
// bottom of the spectrum canvas with the band name centred inside.
//
// Zoom handling mirrors applyZoom() / tuneToClientX(): the visible window is
// the full span / zoom, centred on the tuned centre. Mapping bands against
// that window (not the full span) keeps the strip aligned with the trace at
// every zoom level.
const visibleBands = computed(() => {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  if (hi <= lo) return []
  const { winLo, winHi } = zoomWindowHz(lo, hi)
  const w = winHi - winLo
  return bandPlan.value
    .filter((b) => b.endHz > winLo && b.startHz < winHi)
    .map((b, i) => {
      const leftFrac = Math.max(0, (b.startHz - winLo) / w)
      const rightFrac = Math.min(1, (b.endHz - winLo) / w)
      return {
        key: `${b.name}-${i}`,
        name: b.name,
        // Full name, short form or nothing — whatever fits the strip uncropped.
        label: fitBandLabel(b.name, (rightFrac - leftFrac) * dataBoxWidthPx.value),
        leftPct: leftFrac * 100,
        widthPct: (rightFrac - leftFrac) * 100,
      }
    })
})

// The frequency ticks and labels under the spectrum (waterfallFrequencyTicks.ts).
const freqTicks = computed(() => {
  const lo = spanStartHz.value
  const hi = spanEndHz.value
  // Before the first frame the span is empty; layoutFrequencyTicks returns no
  // ticks for it, and zoomWindowHz is only ever asked about a real span.
  const { winLo, winHi } = hi > lo ? zoomWindowHz(lo, hi) : { winLo: lo, winHi: hi }
  return layoutFrequencyTicks({
    spanStartHz: lo,
    spanEndHz: hi,
    windowLowHz: winLo,
    windowHighHz: winHi,
    dataBoxWidthPx: dataBoxWidthPx.value,
  })
})

// Click-to-tune. Clicking the spectrum or waterfall data area retunes the
// radio to the frequency under the cursor (the marker then follows via the
// store → applyMarker path, same as drag).
//
// We can't use a plain `click` listener: sigplot's canvas mousedown handler
// calls event.preventDefault() (sigplot.js:488), which suppresses the browser's
// synthetic `click`. So detect the click ourselves — record the mousedown
// position, and on mouseup over the same plot with negligible movement (i.e.
// not a marker drag), treat it as a click-to-tune. Capture phase so we read
// the event before sigplot's own handlers.
let mdownX = 0
let mdownY = 0
let mdownEl: HTMLElement | null = null
const CLICK_SLOP_PX = 4

function onPlotMouseDown(e: MouseEvent) {
  // Suppress sigplot's hard-coded right-click unzoom (sigplot.js:1062-1069):
  // continuous-mode programmatic zooms still push exactly one level onto its
  // stack, so a right-click would unzoom the spectrum while our `zoom` ref,
  // the slider and the waterfall all stay put. The Zoom slider is the only
  // input — kill the event before sigplot's mouseup handler runs.
  if (e.button === 2) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  if (e.button !== 0) return
  // A press on a known-frequency marker toggles its name popover via the
  // button's own click handler — never a click-to-tune or a marker drag.
  if (isKnownMarkerEvent(e)) {
    mdownEl = null
    return
  }
  // Drag-to-pan: a mousedown that lands in the bottom freq-label gutter starts
  // a frequency pan instead of a click-to-tune. This runs in the capture phase
  // on .sdr-wf-spectrum (before sigplot's own canvas mousedown), so it reliably
  // wins regardless of canvas/overlay stacking. If it starts a pan, swallow the
  // event so neither sigplot nor click-to-tune also acts on it.
  if (e.currentTarget === specEl.value && tryStartFreqDrag(e)) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  mdownEl = e.currentTarget as HTMLElement
  mdownX = e.clientX
  mdownY = e.clientY
}

function onPlotMouseUp(e: MouseEvent) {
  // Match the right-button suppression in onPlotMouseDown: sigplot's
  // hard-coded unzoom triggers on mouseup, so swallow that too before its
  // canvas-level listener runs.
  if (e.button === 2) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  // A release on a known-frequency marker is its popover toggle — not a tune.
  if (isKnownMarkerEvent(e)) {
    mdownEl = null
    return
  }
  const el = mdownEl
  mdownEl = null
  if (e.button !== 0 || !el || el !== e.currentTarget) return
  // A marker drag also ends with a mouseup over the plot — ignore it.
  if (isBracketDragActive()) return
  // A freq-axis pan started in the gutter (the parent capture handler still
  // recorded mdownEl); the pan handles tuning itself, so don't also click-tune.
  if (isFreqDragActive()) return
  // Moved more than the slop? It was a drag/pan, not a click.
  if (Math.abs(e.clientX - mdownX) > CLICK_SLOP_PX || Math.abs(e.clientY - mdownY) > CLICK_SLOP_PX)
    return
  // Read-only follower: tuning is mirrored from the owner, so ignore click-to-tune
  // (moving the local marker would diverge from the owner until the next state push).
  if (!store.playing || store.readOnly) return
  // A SHIFT-click on the waterfall raster (not the spectrum plot) pins/unpins
  // the signal under the cursor's start/end-time marker instead of tuning.
  // This MUST be opt-in via a modifier: an ordinary spectrum is busy enough
  // that "is there a signal here" is true almost everywhere in view, so a
  // plain click landing on one used to swallow click-to-tune outright —
  // clicking anywhere to retune silently did nothing, leaving the receiver
  // parked whatever frequency it already had. A bare click must always tune.
  if (el === wfEl.value && e.shiftKey) {
    // Pin whatever the hover preview is CURRENTLY showing rather than running
    // detection again at the click point: the raster keeps scrolling between
    // the last mousemove and this mouseup, so a fresh detection can land on a
    // slightly different row/extent (or a momentary noise dip) than what the
    // operator saw and aimed for — that mismatch is what read as "flickering"
    // and made a signal hard to actually select. Falling back to a fresh
    // detection only covers input that never fired a mousemove (touch/pen).
    const clickedSignal =
      hoverSignalMarker.value ?? computeSignalMarkerAtPoint(e.clientX, e.clientY)
    if (clickedSignal) {
      toggleSignalMarkerPin(clickedSignal)
      return
    }
  }
  tuneToClientX(el, e.clientX)
}

// Click-to-tune, drag-to-pan along the frequency gutter and scroll-to-pan
// (refactor series C13). Called where its block used to be, so its document
// listeners keep their order; the spectrum ref is declared further down, hence
// the getter.
const {
  freqDragging,
  isFreqDragActive,
  tryStartFreqDrag,
  abortFreqDrag,
  onPlotWheel: panByWheel,
  tuneToClientX,
} = useFrequencyDrag({
  source: store,
  spectrumElement: () => specEl.value,
  spanStartHz,
  spanEndHz,
  bandInsetLeftPx,
  bandInsetRightPx,
  bandInsetBottomPx,
  livePanOffsetHz,
  zoomWindowHz,
  snapToKnownFreqHz,
  applyView: () => {
    applyZoom() // re-window the spectrum + waterfall raster in place
    applyMarker() // re-pin the bar at screen centre (dispFHz += offset)
  },
})

// A function declaration, not the destructured handler, because the template
// binds it on both plots: Vue binds a declared function directly but wraps a
// destructured value in a per-element arrow, which would leave the raster's
// copy as an uncovered function in the coverage report.
function onPlotWheel(event: WheelEvent) {
  panByWheel(event)
}

// The tuning bracket: the accordions that draw the tuned passband and carrier
// line, their drag-to-retune / resize (mouse and bridged touch), the resize
// cursor and the missed-mouseup safety nets (refactor series C14). Called where
// its block used to be so its document listeners keep their order; the plots
// are reassigned and the element refs declared further down, hence the getters.
const {
  nearEdge,
  applyMarker,
  attachAccordions,
  detachAccordions,
  isBracketDragActive,
  isWritingBracket,
  tryStartBracketTouch,
  abortAccDrag,
} = useBandwidthBracketDrag({
  source: store,
  spectrumPlot: () => plots.spectrum,
  waterfallPlot: () => plots.waterfall,
  spectrumElement: () => specEl.value,
  waterfallElement: () => wfEl.value,
  spanStartHz,
  spanEndHz,
  livePanOffsetHz,
  snapToKnownFreqHz,
})

// Capture-phase touch router for both drag gestures, mirroring
// onPlotMouseDown. Registered on the same two plot wrapper elements (see the
// template) so it reliably intercepts before sigplot's own bubble-phase
// touchstart listener on the widget canvas underneath.
function onPlotTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return // let sigplot handle two-finger pinch-zoom
  // A tap on a known-frequency marker is its popover toggle — leave it to the
  // button's own click and don't start a freq drag / accordion grab.
  if (isKnownMarkerEvent(e)) return
  const touch = e.touches[0]
  /* v8 ignore start -- guarded by the length check above */
  if (!touch) return
  /* v8 ignore stop */
  const isSpec = e.currentTarget === specEl.value
  if (isSpec && tryStartFreqDrag(touch)) {
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  // Otherwise a touch on the bracket is bridged into sigplot's mouse drag;
  // anything else is left to sigplot's native touch pan/pinch-zoom.
  tryStartBracketTouch(e, touch, isSpec)
}
onMounted(() => window.addEventListener('blur', abortAccDrag))
onBeforeUnmount(() => window.removeEventListener('blur', abortAccDrag))
onMounted(() => window.addEventListener('blur', abortFreqDrag))
onBeforeUnmount(() => window.removeEventListener('blur', abortFreqDrag))

const specEl = ref<HTMLElement | null>(null)
const wfEl = ref<HTMLElement | null>(null)

// ── Row clock + signal markers ─────────────────────────────────────────────
// The wall-clock time and bins of every raster row, the clock labels down the
// raster's left edge and the hover/Shift+Click signal marker
// (composables/useSignalMarkers.ts). The frequency scale is read through
// getters because a retune rewrites the shared plot handles.
const {
  wfDataTopPx,
  wfDataHeightPx,
  hoverSignalMarker,
  recordRowPushTime,
  clearRowPushTimes,
  timeMarkerOverlayStyle,
  waterfallTimeMarkers,
  visibleWaterfallSecondTicks,
  signalMarkerLabels,
  computeSignalMarkerAtPoint,
  toggleSignalMarkerPin,
  onWaterfallMouseMove,
  onWaterfallMouseLeave,
} = useSignalMarkers({
  source: store,
  sweeping,
  rasterElement: wfEl,
  bandInsetLeftPx,
  bandInsetRightPx,
  spanStartHz,
  spanEndHz,
  zoomWindowHz,
  firstBinHz: () => plots.firstBinHz,
  hzPerBin: () => plots.hzPerBin,
  rowCapacity: WF_ROWS,
})

onMounted(() => {
  // Pull overlay-visibility flags from the DB so the live spectrum reflects
  // the persisted config on first paint (localStorage is the fallback, not
  // the source of truth across machines).
  void store.hydrateSnapToKnownFromDb()
  void store.hydrateDisplayBandPlanFromDb()
  void store.hydrateDisplayKnownFrequenciesFromDb()
  void store.hydrateDisplayWaterfallTimestampsFromDb()
  void store.hydrateWaterfallTimestampIntervalFromDb()
})

// The plots themselves: creation once layout settles, their layers, the frame
// feed, the stop blanking, the slider/zoom watchers and the teardown
// (composables/useWaterfallPlots.ts). Called last, where the plot block used to
// be, so its watchers and hooks keep their order after every composable above.
useWaterfallPlots({
  source: store,
  plots,
  spectrumElement: () => specEl.value,
  waterfallElement: () => wfEl.value,
  spanStartHz,
  spanEndHz,
  viewRange: {
    zoom,
    zmin,
    zmax,
    autoScale,
    livePanOffsetHz,
    applyZoom,
    applySpecRange,
    clampSliderCollision,
  },
  measureSpectrumDataBox,
  waterfallDataTopPx: wfDataTopPx,
  waterfallDataHeightPx: wfDataHeightPx,
  recordRowPushTime,
  clearRowPushTimes,
  attachAccordions,
  detachAccordions,
  applyMarker,
  isWritingBracket,
  isFreqDragActive,
  attachAnnotationPlugin,
  detachAnnotationPlugin,
})
</script>

<template>
  <div
    id="sdr-waterfall"
    :class="{
      'panel-closed': !panelOpen,
      'edge-resize': nearEdge,
      'decode-open': store.decodeDockOpen,
      'not-playing': !store.playing,
      sweeping: sweeping,
    }"
  >
    <SdrWaterfallSearchOverlay />
    <SdrWaterfallViewSliders
      v-model:zoom="zoom"
      v-model:zmax="zmax"
      v-model:zmin="zmin"
      :disabled="!store.playing || sweeping"
    />
    <div
      ref="specEl"
      class="sdr-wf-spectrum"
      :class="{ 'sdr-wf-spectrum--panning': freqDragging }"
      :style="spectrumStyle"
      @mousedown.capture="onPlotMouseDown"
      @mouseup.capture="onPlotMouseUp"
      @touchstart.capture="onPlotTouchStart"
      @wheel.capture="onPlotWheel"
      @contextmenu.prevent
    >
      <SdrBandPlanOverlay
        v-if="store.displayBandPlan && visibleBands.length > 0"
        :bands="visibleBands"
        :overlay-style="bandOverlayStyle"
      />
      <SdrFrequencyTickGutter :ticks="freqTicks" :gutter-style="tickGutterStyle" />
      <SdrKnownFrequencyMarkers
        v-if="store.displayKnownFrequencies && visibleKnownFreqs.length > 0"
        :markers="visibleKnownFreqs"
        :open-key="openKnownKey"
        :is-popover-shown="isKnownPopoverShown"
        :overlay-style="knownFreqOverlayStyle"
        @toggle="toggleKnownMarker"
        @pointer-enter="onKnownMarkerPointerEnter"
        @pointer-leave="onKnownMarkerPointerLeave"
      />
    </div>
    <div
      ref="wfEl"
      class="sdr-wf-raster"
      :style="rasterStyle"
      @mousedown.capture="onPlotMouseDown"
      @mouseup.capture="onPlotMouseUp"
      @mousemove="onWaterfallMouseMove"
      @mouseleave="onWaterfallMouseLeave"
      @touchstart.capture="onPlotTouchStart"
      @wheel.capture="onPlotWheel"
      @contextmenu.prevent
    >
      <SdrWaterfallTimeOverlay
        :time-markers="waterfallTimeMarkers"
        :second-ticks="visibleWaterfallSecondTicks"
        :signal-labels="signalMarkerLabels"
        :overlay-style="timeMarkerOverlayStyle"
      />
    </div>
  </div>
</template>
