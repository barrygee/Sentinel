<script setup lang="ts">
import './SdrWaterfall.css'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import sigplot, { type Plot } from 'sigplot'
import { useSdrStore } from '@/stores/sdr'
import { useDocumentEvent } from '@/composables/useDocumentEvent'

const store = useSdrStore()

// ── Layout: track the SDR side panel open/closed state ───────────────────────
function _readSidebarOpen(): boolean {
  try { return sessionStorage.getItem('sentinel_sidebar_open') === '1' } catch { return false }
}
const panelOpen = ref<boolean>(_readSidebarOpen())
useDocumentEvent('sentinel:sidebar-state', (e: Event) => {
  panelOpen.value = !!(e as CustomEvent<{ open: boolean }>).detail?.open
})

// ── Intensity (Min/Max) — drives sigplot zmin/zmax on the waterfall ──────────
// The backend sends raw FFT power: 10*log10(|FFT|^2), NOT normalised, so the
// real range is roughly 0..80 dB (int8 IQ), not the -110..-20 a normalised
// receiver would show. Defaults must bracket the real data or the colormap
// pins everything to one colour (the "solid red" symptom). The waterfall also
// starts in auto-scale (autol) so it always has contrast regardless; the
// sliders then act as a manual override.
const zmin = ref(0)
const zmax = ref(80)
const autoScale = ref(true)

// ── Plot instances & layer uuids — deliberately NON-reactive ─────────────────
// sigplot mutates the Plot object heavily; wrapping it in Vue reactivity breaks
// it and tanks performance. Keep these as plain module-of-component bindings.
let specPlot: Plot | null = null
let wfPlot: Plot | null = null
let specUuid = ''
let wfUuid = ''
let subsize = 0
let ro: ResizeObserver | null = null

const rootEl = ref<HTMLElement | null>(null)
const specEl = ref<HTMLElement | null>(null)
const wfEl = ref<HTMLElement | null>(null)

const BG = '#0a0d14'

// Shared "no chrome" options. Option names verified against the installed
// sigplot v3.1.7 constructor (node_modules/sigplot/js/sigplot.js:7314-7359).
// NOTE: the option is `nospecs` (with an 's') — `Gx.specs = !o.nospecs`. When
// false it forces show_x_axis / show_y_axis / show_readout all off, which
// removes the axes, the readout/title strip and the spec area in one shot.
const CLEAN: Record<string, unknown> = {
  nospecs: true,           // <- the key one in v3.1.7: Gx.specs = !o.nospecs
  nospec: true,            // older sigplot 2.x spelling — harmless if ignored
  nogrid: true,
  noxaxis: true,
  noyaxis: true,
  noreadout: true,
  nomenu: true,
  nopan: true,
  nodragdrop: true,
  nokeypress: true,
  no_legend_button: true,
  legend: false,
  hide_note: true,
  autohide_panbars: true,
}

// Number of history rows the waterfall keeps. Set explicitly via `lps` so the
// raster depth does NOT depend on the container's pixel height at mount time —
// layer2d computes lps once at init from `hcb.lps || (Mx.b - Mx.t)`, so without
// this an early/zero-height mount permanently yields a single moving line
// instead of a filled scrolling waterfall.
const WF_ROWS = 1200

function buildPipes(n: number) {
  if (!specPlot || !wfPlot) return
  if (subsize) {
    try { specPlot.remove_layer(specUuid) } catch { /* noop */ }
    try { wfPlot.remove_layer(wfUuid) } catch { /* noop */ }
  }
  subsize = n
  // Spectrum: 1-D line trace. Per the SigPlot developer-tips guidance for
  // real-time 1-D, use overlay_array(null, …) and reload() each frame rather
  // than a pipe (avoids pipe-buffer artifacts).
  specUuid = specPlot.overlay_array(
    null,
    { type: 1000, xunits: 3, yunits: 26, size: n },
  )
  // Waterfall: 2-D raster via overlay_pipe + push (the documented scrolling-2D
  // pattern). `drawmode:'falling'` => newest row enters at the top and the
  // history scrolls downward. `lps` fixes the history depth so it doesn't
  // depend on mount-time pixel height; `pipesize` sizes the ring buffer.
  wfUuid = wfPlot.overlay_pipe(
    {
      type: 2000,
      subsize: n,
      xunits: 3,
      lps: WF_ROWS,
      pipesize: WF_ROWS * n * 2,
    },
    { drawmode: 'falling', framesize: n },
  )
  // cmap 1 = the blue→red ramp. Start auto-scaling z to the live data so the
  // raster always has contrast; the Min/Max sliders switch to a fixed range.
  if (autoScale.value) {
    wfPlot.change_settings({ cmap: 1, autol: 5 })
  } else {
    wfPlot.change_settings({ cmap: 1, autol: -1, zmin: zmin.value, zmax: zmax.value })
  }
}

let rafId = 0

function initPlots() {
  if (!specEl.value || !wfEl.value || !rootEl.value) return

  // Both plots get the no-chrome treatment. The spectrum is still a 1-D line
  // trace (just unlabelled); the waterfall is the raster.
  specPlot = new sigplot.Plot(specEl.value, {
    ...CLEAN,
    autol: 5,
    colors: { bg: BG, fg: '#7fd4ff' },
  })
  wfPlot = new sigplot.Plot(wfEl.value, {
    ...CLEAN,
    colors: { bg: BG, fg: BG },
  })

  buildPipes(1024)

  // sigplot sizes its canvas to the element's clientHeight at creation time and
  // only resizes on checkresize(). The flex children settle their final height
  // AFTER creation, so force a resize on the next frame (fixes the canvas being
  // stuck at its initial ~300px). Observe the plot ELEMENTS (not just the root)
  // so internal flex resizes — and the side-panel toggle — both trigger it.
  ro = new ResizeObserver(() => {
    specPlot?.checkresize()
    wfPlot?.checkresize()
  })
  ro.observe(specEl.value as HTMLElement)
  ro.observe(wfEl.value as HTMLElement)

  requestAnimationFrame(() => {
    specPlot?.checkresize()
    wfPlot?.checkresize()
  })
}

onMounted(() => {
  // Defer until the fixed/flex container has resolved its real pixel size.
  // layer2d derives the waterfall geometry once at init from the plot height,
  // so creating the plots before layout settles breaks the raster.
  rafId = requestAnimationFrame(() => {
    rafId = requestAnimationFrame(initPlots)
  })
})

// Each new spectrum frame: reload() the 1-D spectrum array, push() a row into
// the 2-D waterfall pipe. Read imperatively — bins is not deep-tracked by Vue.
// Gated on store.playing: the spectrum stream is always-on once a radio is
// connected, but the user only wants the display live while Play is active.
watch(
  () => store.lastSpectrum,
  (frame) => {
    if (!store.playing) return
    if (!frame || !specPlot || !wfPlot) return
    if (frame.bins.length !== subsize) buildPipes(frame.bins.length)
    specPlot.reload(specUuid, frame.bins)
    wfPlot.push(wfUuid, frame.bins)
  },
)

// When playback stops, blank both plots so the display goes idle (rather than
// freezing on the last frame). On Play, frames resume via the watch above.
watch(
  () => store.playing,
  (isPlaying) => {
    if (isPlaying || !specPlot || !wfPlot || !subsize) return
    const blank = new Float32Array(subsize)
    try { specPlot.reload(specUuid, blank) } catch { /* noop */ }
    // Rebuild the waterfall pipe to clear its scroll history.
    try {
      wfPlot.remove_layer(wfUuid)
      wfUuid = wfPlot.overlay_pipe(
        {
          type: 2000,
          subsize,
          xunits: 3,
          lps: WF_ROWS,
          pipesize: WF_ROWS * subsize * 2,
        },
        { drawmode: 'falling', framesize: subsize },
      )
      wfPlot.change_settings({ cmap: 1, autol: 5 })
    } catch { /* noop */ }
  },
)

// Moving a slider switches the waterfall from auto-scale to the fixed range.
watch([zmin, zmax], ([lo, hi]) => {
  autoScale.value = false
  wfPlot?.change_settings({ autol: -1, zmin: lo, zmax: hi })
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  ro?.disconnect()
  ro = null
  try { specPlot?.remove_layer(specUuid) } catch { /* noop */ }
  try { wfPlot?.remove_layer(wfUuid) } catch { /* noop */ }
  try { specPlot?.disable_listeners() } catch { /* noop */ }
  try { wfPlot?.disable_listeners() } catch { /* noop */ }
  specPlot = null
  wfPlot = null
})
</script>

<template>
  <div
    id="sdr-waterfall"
    ref="rootEl"
    :class="{ 'panel-closed': !panelOpen }"
  >
    <div class="sdr-wf-controls">
      <label>
        Max
        <input type="range" min="-120" max="20" step="1" v-model.number="zmax" />
        <span>{{ zmax }}</span>
      </label>
      <label>
        Min
        <input type="range" min="-120" max="20" step="1" v-model.number="zmin" />
        <span>{{ zmin }}</span>
      </label>
    </div>
    <div ref="specEl" class="sdr-wf-spectrum"></div>
    <div ref="wfEl" class="sdr-wf-raster"></div>
  </div>
</template>
