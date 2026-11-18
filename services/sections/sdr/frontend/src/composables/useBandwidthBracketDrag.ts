/**
 * The tuning bracket on the spectrum and waterfall: the sigplot accordions that
 * draw the tuned passband and carrier line, pinning them to the store's tuned
 * frequency and bandwidth (`applyMarker`), dragging them to retune or resize
 * the bandwidth (mouse, and touch bridged into sigplot's mouse pipeline), the
 * resize cursor over an edge, and the safety nets that release a drag that
 * never got its mouseup.
 *
 * Split out of `SdrWaterfall.vue` (refactor series C14). The component still
 * owns the plots and their elements (passed as getters: it creates and
 * reassigns the plots, and declares the element refs further down), the span
 * and the live pan offset, and the plots' mouse/touch routers, which ask
 * `isBracketDragActive` and `tryStartBracketTouch` before tuning or panning.
 */
import { ref, type Ref } from 'vue'
import type { AccordionPlugin, Plot } from 'sigplot'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import type { SdrMode } from '../stores/sdr'

/** The parts of the SDR store the bracket reads and writes. */
export interface BracketTuningSource {
  readonly currentFreqHz: number
  readonly bwHz: number
  readonly sampleRate: number
  readonly playing: boolean
  readonly currentMode: SdrMode
  /** A follower mirrors the owner's tuning and must never retune. */
  readonly readOnly: boolean
  requestTune: (freqHz: number) => void
  requestBandwidth: (bandwidthHz: number) => void
}

/** What the component hands the bracket. */
export interface BandwidthBracketDragOptions {
  source: BracketTuningSource
  spectrumPlot: () => Plot | null
  waterfallPlot: () => Plot | null
  spectrumElement: () => HTMLElement | null
  waterfallElement: () => HTMLElement | null
  spanStartHz: Readonly<Ref<number>>
  spanEndHz: Readonly<Ref<number>>
  /** The gutter pan's display-only offset: the bar is drawn shifted by it. */
  livePanOffsetHz: Readonly<Ref<number>>
  /** Snaps a frequency onto a nearby known-frequency marker (identity when none is close). */
  snapToKnownFreqHz: (freqHz: number) => number
}

/** The bracket, as the component uses it. */
export interface BandwidthBracketDrag {
  /** True while the pointer is over a bracket edge: drives the resize cursor. */
  nearEdge: Ref<boolean>
  applyMarker: () => void
  attachAccordions: (
    AccordionPluginClass: typeof AccordionPlugin,
    spectrumPlot: Plot,
    waterfallPlot: Plot,
  ) => void
  detachAccordions: () => void
  isBracketDragActive: () => boolean
  isWritingBracket: () => boolean
  tryStartBracketTouch: (event: TouchEvent, touch: Touch, onSpectrum: boolean) => boolean
  abortAccDrag: () => void
}

/** The narrowest passband the bracket can be resized to. */
export const MIN_BW_HZ = 200
const HZ_PER_MHZ = 1e6

/** Builds the tuning bracket for one waterfall. */
export function useBandwidthBracketDrag({
  source,
  spectrumPlot,
  waterfallPlot,
  spectrumElement,
  waterfallElement,
  spanStartHz,
  spanEndHz,
  livePanOffsetHz,
  snapToKnownFreqHz,
}: BandwidthBracketDragOptions): BandwidthBracketDrag {
  // ── Tuned-frequency marker (SigPlot Accordion plugin) ────────────────────────
  // Two instances because the two plots use different x-axis units (verified):
  // the SPECTRUM layer x is in MHz (xstartMHz/xdeltaMHz) while the WATERFALL
  // layer x is in raw Hz. With mode:'absolute' the accordion positions itself in
  // the plot's x data units, so each instance gets its centre/width in that
  // plot's units. Single source of truth is the store (currentFreqHz + bwHz).
  let specAcc: AccordionPlugin | null = null // MHz spectrum plot — shaded passband
  let wfAcc: AccordionPlugin | null = null // Hz waterfall plot — shaded passband
  // Carrier-line accordions: zero-shade, single line drawn on the actual carrier
  // frequency. Decoupled from the passband shading so SSB modes (USB/LSB) can
  // shift the shaded rectangle to one side while keeping the tuning line on the
  // carrier itself, matching SDR#.
  let specCar: AccordionPlugin | null = null
  let wfCar: AccordionPlugin | null = null

  // The passband shade is always drawn symmetric around the carrier, so the tuning
  // line sits dead-centre in the shaded band in every mode (including SSB). The
  // carrier stays at the centre line on the plot; the shade is centred on it, and
  // the inverse is the identity so a drag commits the bracket centre as the
  // carrier. `mode` is retained for call-site symmetry / future per-mode geometry.
  function bracketGeomHz(carrierHz: number, bwHz: number, _mode: SdrMode) {
    return { centerHz: carrierHz, widthHz: bwHz }
  }
  function carrierFromBracketHz(centerHz: number, _widthHz: number, _mode: SdrMode) {
    return centerHz
  }

  // Independent drag baseline, snapshotted on mousedown over an accordion. The
  // mouseup handler diffs the live centre/width against THIS — not against
  // lastCommitted*, which applyMarker() overwrites on every store change (and a
  // reactive bwHz round-trip can fire applyMarker mid-drag, resetting the
  // baseline to the dragged value → mouseup sees zero delta → "nothing dragged"
  // and the change is lost before it ever reaches the panel).
  let dragBaseFreqHz = 0
  let dragBaseBwHz = 0
  let dragActive = false
  // Guards the document mouseup handler while WE set centre/width programmatically
  // (applyMarker / post-drag re-sync) so our own writes aren't read back as a
  // user drag.
  let suppressAccEvents = false
  // True while the cursor is hovering an accordion edge (the resize zone). Drives
  // a cursor: ew-resize override so the user sees a resize affordance instead of
  // the plot's default crosshair. sigplot computes this hit-test for us and
  // stores it on properties.edge_highlight during its own _onMouseMove.
  const nearEdge = ref(false)

  // ── Known-frequency markers ─────────────────────────────────────────────────

  // Push the store's tuned freq + demod bandwidth onto BOTH accordions, each in
  // its plot's x units (spectrum=MHz, waterfall=Hz). Also refreshes the drag
  // limits to the current span and the visible/hidden state from play status.
  // Cheap to call repeatedly — the fluent setter no-ops on unchanged values.
  function applyMarker() {
    if (!specAcc || !wfAcc) return
    const fHz = source.currentFreqHz
    const bHz = Math.max(MIN_BW_HZ, source.bwHz || 10000)
    const span = source.sampleRate || spanEndHz.value - spanStartHz.value || bHz
    // Display-only frequency: while live-panning the freq axis (drag), the visible
    // window slides by livePanOffsetHz but the tuned freq hasn't changed yet. Shift
    // the marker's drawn position by the SAME offset so the bar stays on the same
    // screen pixel (span centre) while the content scrolls under it. The committed
    // store values (lastCommittedFreqHz below) stay on the true carrier — only the
    // accordion geometry uses dispFHz.
    const dispFHz = fHz + livePanOffsetHz.value
    const { centerHz, widthHz } = bracketGeomHz(dispFHz, bHz, source.currentMode)
    // Carrier-line accordions hold a fixed near-zero width — they only draw the
    // tuning line at the actual carrier, never participate in passband shading.
    const CARRIER_W_HZ = 1
    suppressAccEvents = true
    try {
      specAcc.center(centerHz / HZ_PER_MHZ)
      specAcc.width(widthHz / HZ_PER_MHZ)
      specAcc.min_width(MIN_BW_HZ / HZ_PER_MHZ)
      specAcc.max_width(span / HZ_PER_MHZ)
      wfAcc.center(centerHz)
      wfAcc.width(widthHz)
      wfAcc.min_width(MIN_BW_HZ)
      wfAcc.max_width(span)
      // specCar/wfCar are created unconditionally in initPlots alongside specAcc/
      // wfAcc, and applyMarker returns above when the accordions are null, so these
      // carrier accordions are always present here — the null arm never runs.
      /* v8 ignore start */
      if (specCar) {
        specCar.center(dispFHz / HZ_PER_MHZ)
        specCar.width(CARRIER_W_HZ / HZ_PER_MHZ)
        specCar.min_width(CARRIER_W_HZ / HZ_PER_MHZ)
        specCar.max_width(span / HZ_PER_MHZ)
      }
      if (wfCar) {
        wfCar.center(dispFHz)
        wfCar.width(CARRIER_W_HZ)
        wfCar.min_width(CARRIER_W_HZ)
        wfCar.max_width(span)
      }
      /* v8 ignore stop */
      const vis = source.playing
      specAcc.display(vis)
      wfAcc.display(vis)
      /* v8 ignore start */
      if (specCar) specCar.display(vis)
      if (wfCar) wfCar.display(vis)
      /* v8 ignore stop */
    } finally {
      suppressAccEvents = false
    }
  }

  // Tuned-frequency marker. Two AccordionPlugin instances per plot (passband +
  // carrier line) — see the unit-split note at their declaration. Plugins live
  // on _Gx.plugins with an independent canvas, so they survive the component's
  // buildPipes() layer rebuilds; it just re-asserts centre/width after a rebuild
  // via applyMarker().
  function attachAccordions(
    AccordionPluginClass: typeof AccordionPlugin,
    spectrumPlot: Plot,
    waterfallPlot: Plot,
  ): void {
    const accCommon = {
      mode: 'absolute' as const,
      direction: 'vertical' as const,
      // Keep draw_center_line on but make it visually invisible — sigplot's
      // move-drag hit-test uses `center_line_style.lineWidth` as the click
      // tolerance around center_location. A wider, transparent line gives the
      // user a comfortable area to grab the bracket without painting a second
      // line on top of the carrier-line accordion.
      draw_center_line: true,
      draw_edge_lines: false,
      shade_area: true,
      // Shade the tuned passband in a translucent blue wash (matching the trace
      // colour) so the band reads as part of the trace rather than a black gap.
      // Kept very subtle (low opacity) so the trace underneath stays legible.
      fill_style: { fillStyle: '#00aaff', opacity: 0.12 },
      center_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 20, lineCap: 'butt' },
      // sigplot's edge-drag (bandwidth-resize) hit-test tolerance is
      // `edge_line_style.lineWidth + 5` px either side of the edge — a mouse
      // cursor can land in a 5px zone, a fingertip can't. Widened to match the
      // center-drag zone above (25px either side ≈ WCAG 2.5.8's 24px target-size
      // recommendation) so touch dragging the passband edge is reliable; the
      // line itself stays invisible (draw_edge_lines: false), only the hit test
      // gets bigger. nearAccGrabZone() below reads this same property, so the
      // touch pre-filter tolerance always matches sigplot's own.
      edge_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 20, lineCap: 'butt' },
    }
    const carCommon = {
      mode: 'absolute' as const,
      direction: 'vertical' as const,
      draw_center_line: true,
      draw_edge_lines: false,
      shade_area: false,
      fill_style: { fillStyle: 'rgba(0,0,0,0)', opacity: 0 },
      center_line_style: { strokeStyle: '#ffffff', lineWidth: 1, lineCap: 'butt' },
      edge_line_style: { strokeStyle: 'rgba(0,0,0,0)', lineWidth: 0, lineCap: 'butt' },
    }
    // Waterfall variants: same geometry/hit-test as the spectrum, but no passband
    // shade (the raster is busy enough) and a toned-down carrier line so the tuning
    // bar stays subtle over the raster. The spectrum keeps accCommon/carCommon
    // untouched. Only the *visible* styles change — the transparent center-line
    // hit zone (lineWidth: 20) is preserved so the bracket stays grabbable.
    const wfAccStyle = {
      ...accCommon,
      // No passband shading over the waterfall raster — only the carrier line marks
      // the tune there, keeping the busy raster readable.
      shade_area: false,
    }
    const wfCarStyle = {
      ...carCommon,
      center_line_style: {
        strokeStyle: 'rgba(255,255,255,0.55)',
        lineWidth: 1,
        lineCap: 'butt' as const,
      },
    }
    specAcc = new AccordionPluginClass({ ...accCommon })
    wfAcc = new AccordionPluginClass({ ...wfAccStyle })
    specCar = new AccordionPluginClass({ ...carCommon })
    wfCar = new AccordionPluginClass({ ...wfCarStyle })
    spectrumPlot.add_plugin(specAcc, 1)
    waterfallPlot.add_plugin(wfAcc, 1)
    spectrumPlot.add_plugin(specCar, 1)
    waterfallPlot.add_plugin(wfCar, 1)
    applyMarker()
  }

  // Unmount: drop all four accordions from their plots. Each removal is wrapped
  // because a plot torn down mid-init may already have lost its plugin list.
  function detachAccordions(): void {
    try {
      if (specAcc) spectrumPlot()?.remove_plugin(specAcc)
    } catch {
      /* noop */
    }
    try {
      if (wfAcc) waterfallPlot()?.remove_plugin(wfAcc)
    } catch {
      /* noop */
    }
    try {
      if (specCar) spectrumPlot()?.remove_plugin(specCar)
    } catch {
      /* noop */
    }
    try {
      if (wfCar) waterfallPlot()?.remove_plugin(wfCar)
    } catch {
      /* noop */
    }
    specAcc = null
    wfAcc = null
    specCar = null
    wfCar = null
  }

  // A mouseup on the plot that ends a bracket drag is not a click-to-tune.
  function isBracketDragActive(): boolean {
    return dragActive || accIsDragging(specAcc) || accIsDragging(wfAcc)
  }

  // True only inside a synchronous accordion write of our own, so the
  // component's store watcher doesn't feed it back as a change.
  function isWritingBracket(): boolean {
    return suppressAccEvents
  }

  // Type for poking the plugin's internal drag flags (no public accessor).
  type AccDragState = { dragging?: boolean; edge_dragging?: boolean }
  function accIsDragging(a: AccordionPlugin | null): boolean {
    const s = a as unknown as AccDragState | null
    return !!s && (!!s.dragging || !!s.edge_dragging)
  }
  function accIsEdgeDragging(a: AccordionPlugin | null): boolean {
    const s = a as unknown as AccDragState | null
    return !!s && !!s.edge_dragging
  }

  // Live mirror: while the user drags one plot's accordion, sigplot's
  // _onMouseMove updates ONLY that plot (and refreshes only it). Mirror its live
  // centre/width onto the OTHER plot every mousemove so both move together
  // instead of the other one snapping only on release. Units differ (spectrum =
  // MHz, waterfall = Hz), so convert per direction. suppressAccEvents stops the
  // mirrored setter from being read back as a second drag.
  // Snapshot the pre-drag baseline the instant the user grabs an accordion. The
  // sigplot accordion sets its dragging/edge_dragging flag in its own mousedown
  // (fired via the plot's internal 'mdown' before this document-level handler on
  // the same native event), so by the time we run accIsDragging() it's already
  // true. We capture the CURRENT live centre/width as the baseline — this is the
  // value before the user moves the mouse — and freeze it for the whole drag.
  // Force-clear sigplot's internal accordion drag flags on both plots. sigplot's
  // Accordion._onDocMouseUp is dead code (`!dragging || !edge_dragging` is always
  // true since mousedown sets exactly one of them), so it never clears them
  // itself; any leftover flag makes the next mousemove re-drag the marker — the
  // "tuning bar stuck to the cursor" bug. Callers guard specAcc/wfAcc non-null.
  function clearAccDragFlags() {
    for (const s of [specAcc, wfAcc] as unknown as AccDragState[]) {
      s.dragging = false
      s.edge_dragging = false
    }
  }

  // End an accordion drag: read the final bracket geometry, commit a retune /
  // bandwidth change if it actually moved, re-sync both plots, and ALWAYS release
  // the sigplot drag flags (including the no-movement "click" path, which would
  // otherwise leave the bar glued to the cursor). Shared by the document mouseup
  // and the missed-mouseup recovery in the drag mousemove handler.
  function commitAccDrag() {
    // Both callers (document mouseup, missed-up recovery) already guard the
    // accordions non-null, so this is unreachable defensive narrowing for TS.
    /* v8 ignore start */
    if (!specAcc || !wfAcc) return
    /* v8 ignore stop */
    // Read-only follower: the marker mirrors the owner. Drop any drag commit so it
    // can't retune/rebandwidth; the marker snaps back on the next owner state push.
    if (source.readOnly) {
      clearAccDragFlags()
      return
    }
    dragActive = false
    // Read the final geometry from the WATERFALL accordion (Hz, no MHz rounding
    // loss). The mousemove mirror keeps both accordions in lock-step, so either
    // is authoritative; we pick Hz to avoid a float round-trip through MHz.
    const mode = source.currentMode
    const bw = wfAcc.width()
    const carrierHz = carrierFromBracketHz(wfAcc.center(), bw, mode)
    const freqMoved = Math.abs(carrierHz - dragBaseFreqHz) > 1
    const bwMoved = Math.abs(bw - dragBaseBwHz) > 1
    if (!freqMoved && !bwMoved) {
      // A click / sub-1Hz nudge on the bar: nothing to commit, but the flags are
      // still set from mousedown — clear them or the bar sticks to the cursor.
      clearAccDragFlags()
      return
    }
    // Snap a moved carrier to a nearby known frequency so the tuner bar settles onto
    // it (no-op when snapping is off / none in range). Bandwidth is never snapped.
    const committedCarrierHz = freqMoved ? snapToKnownFreqHz(Math.round(carrierHz)) : carrierHz
    if (freqMoved) source.requestTune(Math.round(committedCarrierHz))
    if (bwMoved) source.requestBandwidth(Math.round(bw))
    // Re-sync both plots immediately so the un-dragged plot follows now (don't
    // wait for the debounced backend echo). Re-derive the bracket geometry from
    // the carrier so the shade stays centred on the tuning line after a resize.
    const { centerHz: syncCenterHz, widthHz: syncWidthHz } = bracketGeomHz(
      committedCarrierHz,
      bw,
      mode,
    )
    suppressAccEvents = true
    try {
      specAcc.center(syncCenterHz / HZ_PER_MHZ)
      specAcc.width(syncWidthHz / HZ_PER_MHZ)
      wfAcc.center(syncCenterHz)
      wfAcc.width(syncWidthHz)
    } finally {
      suppressAccEvents = false
    }
    clearAccDragFlags()
  }

  // Abort an in-progress drag WITHOUT committing — for a cancelled pointer gesture
  // (pointercancel, e.g. touch/pen taken over by the browser) or the window losing
  // focus (blur) mid-drag, where the last geometry can't be trusted. Release the
  // flags and snap both brackets back to the real tuned state (the store is the
  // source of truth via applyMarker), so the bar is never left glued to the cursor
  // or stranded at an uncommitted position.
  function abortAccDrag() {
    if (!dragActive) return
    // Once a drag is active the accordions exist (mousedown only sets dragActive
    // after initPlots), so this null-check is unreachable defensive narrowing.
    /* v8 ignore start */
    if (!specAcc || !wfAcc) return
    /* v8 ignore stop */
    dragActive = false
    clearAccDragFlags()
    applyMarker()
  }

  useDocumentEvent('mousedown', () => {
    if (!specAcc || !wfAcc) return
    if (!accIsDragging(specAcc) && !accIsDragging(wfAcc)) return
    dragBaseBwHz = wfAcc.width()
    dragBaseFreqHz = carrierFromBracketHz(wfAcc.center(), dragBaseBwHz, source.currentMode)
    dragActive = true
  })

  useDocumentEvent('mousemove', (e: Event) => {
    if (suppressAccEvents || !specAcc || !wfAcc) return
    // Missed-mouseup recovery: releasing the button OUTSIDE the window never
    // delivers a mouseup, so the drag stays "active" and the bar chases the cursor
    // forever. A later mousemove with no button held (buttons === 0) means the
    // drag really ended — commit it now instead of following the pointer.
    if (dragActive && (e as MouseEvent).buttons === 0) {
      commitAccDrag()
      return
    }
    const specDragging = accIsDragging(specAcc)
    const wfDragging = accIsDragging(wfAcc)
    if (!specDragging && !wfDragging) return
    const mode = source.currentMode
    const isSSB = mode === 'USB' || mode === 'LSB'
    const edgeDragging = isSSB && (accIsEdgeDragging(specAcc) || accIsEdgeDragging(wfAcc))
    suppressAccEvents = true
    try {
      // Read sigplot's just-updated geometry from whichever accordion the user
      // grabbed (units: spectrum=MHz, waterfall=Hz).
      let rawCenterHz: number
      let rawWidthHz: number
      if (specDragging) {
        rawCenterHz = specAcc.center() * HZ_PER_MHZ
        rawWidthHz = specAcc.width() * HZ_PER_MHZ
      } else {
        rawCenterHz = wfAcc.center()
        rawWidthHz = wfAcc.width()
      }

      let carrierHz: number
      let widthHz: number
      if (isSSB && edgeDragging) {
        // Resize: keep the carrier-side edge pinned to the original carrier and
        // let the outer edge follow the cursor. sigplot grows width symmetrically
        // around its (shifted) centre, so the outer edge is at
        //   USB: rawCenter + rawWidth/2  (above the carrier)
        //   LSB: rawCenter - rawWidth/2  (below the carrier)
        // New width = distance from carrier to that outer edge.
        carrierHz = dragBaseFreqHz
        const outerHz = mode === 'USB' ? rawCenterHz + rawWidthHz / 2 : rawCenterHz - rawWidthHz / 2
        widthHz = Math.max(MIN_BW_HZ, Math.abs(outerHz - carrierHz))
      } else if (isSSB) {
        // Move: sigplot moved the bracket centre; the carrier must trail it by
        // exactly bw/2 (USB: carrier below the new centre, LSB: above).
        carrierHz = carrierFromBracketHz(rawCenterHz, rawWidthHz, mode)
        widthHz = rawWidthHz
      } else {
        // Symmetric modes — carrier IS the centre.
        carrierHz = rawCenterHz
        widthHz = rawWidthHz
      }

      const { centerHz: bcHz, widthHz: bwOut } = bracketGeomHz(carrierHz, widthHz, mode)
      specAcc.center(bcHz / HZ_PER_MHZ)
      specAcc.width(bwOut / HZ_PER_MHZ)
      wfAcc.center(bcHz)
      wfAcc.width(bwOut)
      // Carrier accordions are always present once initPlots has run (the drag
      // handlers only fire after init), so the null arm is unreachable.
      /* v8 ignore start */
      if (specCar) {
        specCar.center(carrierHz / HZ_PER_MHZ)
      }
      if (wfCar) {
        wfCar.center(carrierHz)
      }
      /* v8 ignore stop */
    } finally {
      suppressAccEvents = false
    }
  })

  // Cursor affordance: show ew-resize when the pointer is over an accordion edge
  // (the bandwidth resize zone). We can't piggyback on sigplot's edge_highlight:
  // sigplot's mousemove handler is rate-throttled (throttledOnMouseMove), so when
  // a raw document mousemove fires, edge_highlight is stale/lagging. Instead we
  // replicate sigplot's own hit-test (_onMouseDown, sigplot.accordion.js:488):
  // vertical accordion → mouse x within (edge_line_width + 5) px of loc_1/loc_2.
  // loc_1/loc_2 are canvas-pixel edge positions, refreshed every draw (not
  // throttled), and the plot's Mx gives the data-area bounds. The plot's
  // internal canvas is absolutely positioned at (0,0) inside the plot element,
  // so the element's client rect maps clientX→xpos exactly like sigplot does.
  type AccGeom = {
    edge_dragging?: boolean
    properties?: {
      loc_1?: number
      loc_2?: number
      center_location?: number
      edge_line_style?: { lineWidth?: number }
      center_line_style?: { lineWidth?: number }
    }
  }
  type PlotMx = { l: number; r: number; t: number; b: number; wid_canvas?: HTMLCanvasElement }
  function nearAccEdge(
    acc: AccordionPlugin | null,
    plot: Plot | null,
    el: HTMLElement | null,
    clientX: number,
    clientY: number,
  ): boolean {
    const a = acc as unknown as AccGeom | null
    if (!a || !el) return false
    if (a.edge_dragging) return true // mid-resize: hold the cursor for the whole drag
    const p = a.properties
    if (!p || p.loc_1 === undefined || p.loc_2 === undefined) return false
    const mx = (plot as unknown as { _Mx?: PlotMx } | null)?._Mx
    if (!mx) return false
    const rect = el.getBoundingClientRect()
    const xpos = clientX - rect.left
    const ypos = clientY - rect.top
    if (xpos < mx.l || xpos > mx.r || ypos < mx.t || ypos > mx.b) return false
    const elw = p.edge_line_style?.lineWidth ?? 1
    const tol = elw + 5
    return Math.abs(p.loc_1 - xpos) < tol || Math.abs(p.loc_2 - xpos) < tol
  }
  useDocumentEvent('mousemove', (e: Event) => {
    const me = e as MouseEvent
    nearEdge.value =
      nearAccEdge(specAcc, spectrumPlot(), spectrumElement(), me.clientX, me.clientY) ||
      nearAccEdge(wfAcc, waterfallPlot(), waterfallElement(), me.clientX, me.clientY)
  })

  // ── Touch support for the accordion band/marker drag ────────────────────────
  // sigplot's Accordion plugin only ever drags in response to its OWN 'mdown'/
  // 'mmove' plugin events, which sigplot.js dispatches exclusively from native
  // `mousedown`/`mousemove` listeners it registers on the plot's widget canvas
  // (mx.addEventListener(Mx, "mousedown", ...) — see sigplot.js). It has no touch
  // wiring of its own for the accordion; sigplot.js's OWN touchstart handler
  // instead unconditionally preventDefaults and takes over any single-finger
  // touch on the canvas as a view pan (see ontouchstart in sigplot.js), which
  // would swallow a touch meant to drag the tuning bracket before our code ever
  // sees it.
  //
  // Rather than reimplement the accordion's carrier/width math a second time for
  // touch (duplicating the SSB edge-vs-move geometry, snap-to-known-freq, and
  // the lock-step mirror between the two plots above), we bridge: when a
  // touchstart lands within the accordion's own grab tolerance (nearAccGrabZone,
  // same tolerance sigplot's hit-test uses — see the edge_line_style/
  // center_line_style comments at the Accordion setup), we stop the touch from
  // reaching sigplot's native touch-pan handler and instead dispatch a synthetic
  // MouseEvent at the plot's widget canvas. That feeds sigplot's real
  // mousedown/mousemove/mouseup pipeline exactly as a real mouse would — sigplot
  // updates its own accordion geometry, and EVERY document-level mouse listener
  // above (mirror, missed-mouseup recovery, commit) fires unchanged because a
  // dispatched MouseEvent bubbles to `document` like any other. Touches that
  // land elsewhere on the plot are left alone, so sigplot's native touch pan/
  // pinch-zoom keeps working exactly as it does today.
  function accWidCanvas(plot: Plot | null): HTMLCanvasElement | null {
    const mx = (plot as unknown as { _Mx?: PlotMx } | null)?._Mx
    return mx?.wid_canvas ?? null
  }

  function dispatchBridgedMouseEvent(
    plot: Plot | null,
    type: 'mousedown' | 'mousemove' | 'mouseup',
    clientX: number,
    clientY: number,
  ): void {
    const canvas = accWidCanvas(plot)
    // Only called once a bridge has started against a specific plot, and the
    // plot (and its canvas) stay mounted for the drag's whole lifetime.
    /* v8 ignore start */
    if (!canvas) return
    /* v8 ignore stop */
    canvas.dispatchEvent(
      new MouseEvent(type, {
        clientX,
        clientY,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )
  }

  // Touch pre-filter deciding whether a touchstart should be bridged into
  // sigplot's mouse-driven accordion drag. Mirrors sigplot's OWN _onMouseDown
  // hit-test (edge/center line width + 5px) read directly off the accordion's
  // live properties, so it never drifts from whatever grab-zone size accCommon
  // configures above (both are deliberately widened there for a finger-sized
  // touch target).
  function nearAccGrabZone(
    acc: AccordionPlugin | null,
    plot: Plot | null,
    el: HTMLElement | null,
    clientX: number,
    clientY: number,
  ): boolean {
    const a = acc as unknown as AccGeom | null
    // The only call site (tryStartBracketTouch below) already guards on
    // `acc && plot && el` before calling in, so this is unreachable defensive
    // narrowing — kept in case a future caller stops guarding.
    /* v8 ignore start */
    if (!a || !el) return false
    /* v8 ignore stop */
    const p = a.properties
    if (!p) return false
    const mx = (plot as unknown as { _Mx?: PlotMx } | null)?._Mx
    if (!mx) return false
    const rect = el.getBoundingClientRect()
    const xpos = clientX - rect.left
    const ypos = clientY - rect.top
    if (xpos < mx.l || xpos > mx.r || ypos < mx.t || ypos > mx.b) return false
    const edgeTol = (p.edge_line_style?.lineWidth ?? 1) + 5
    if (
      (p.loc_1 !== undefined && Math.abs(p.loc_1 - xpos) < edgeTol) ||
      (p.loc_2 !== undefined && Math.abs(p.loc_2 - xpos) < edgeTol)
    ) {
      return true
    }
    const centerTol = (p.center_line_style?.lineWidth ?? 1) + 5
    return p.center_location !== undefined && Math.abs(p.center_location - xpos) < centerTol
  }

  // Which plot (if any) currently owns an active touch-to-mouse bridge. Only one
  // touch drives this at a time — the component's onPlotTouchStart ignores a
  // second finger, matching sigplot's own single-finger accordion drag.
  let touchAccBridgePlot: Plot | null = null

  useDocumentEvent(
    'touchmove',
    (e: Event) => {
      if (!touchAccBridgePlot) return
      const te = e as TouchEvent
      const touch = te.touches[0]
      /* v8 ignore start -- a single-finger drag always has one active touch */
      if (!touch) return
      /* v8 ignore stop */
      te.preventDefault() // don't let the page scroll while dragging the bracket
      dispatchBridgedMouseEvent(touchAccBridgePlot, 'mousemove', touch.clientX, touch.clientY)
    },
    { passive: false },
  )

  useDocumentEvent('touchend', (e: Event) => {
    const plot = touchAccBridgePlot
    if (!plot) return
    touchAccBridgePlot = null
    const te = e as TouchEvent
    const touch = te.changedTouches[0]
    /* v8 ignore start -- a touchend always reports the finger that just lifted */
    if (!touch) return
    /* v8 ignore stop */
    dispatchBridgedMouseEvent(plot, 'mouseup', touch.clientX, touch.clientY)
  })

  // Interrupted gesture: abort (no commit) rather than dispatch a synthetic
  // mouseup, mirroring the pointercancel/blur safety nets for the mouse path.
  useDocumentEvent('touchcancel', () => {
    if (!touchAccBridgePlot) return
    touchAccBridgePlot = null
    abortAccDrag()
  })

  // The bracket half of the plots' capture-phase touchstart router (the
  // component's onPlotTouchStart, which first rules out pinch-zoom, known-marker
  // taps and gutter pans). A touch inside the accordion's grab zone is stopped
  // before sigplot's own bubble-phase touchstart on the widget canvas
  // underneath, and bridged into its mouse-driven drag.
  function tryStartBracketTouch(event: TouchEvent, touch: Touch, onSpectrum: boolean): boolean {
    const acc = onSpectrum ? specAcc : wfAcc
    const plot = onSpectrum ? spectrumPlot() : waterfallPlot()
    const el = onSpectrum ? spectrumElement() : waterfallElement()
    if (!acc || !plot || !el || !nearAccGrabZone(acc, plot, el, touch.clientX, touch.clientY)) {
      // Not the bracket — leave the touch alone so sigplot's native touch
      // pan/pinch-zoom handles it.
      return false
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    touchAccBridgePlot = plot
    dispatchBridgedMouseEvent(plot, 'mousedown', touch.clientX, touch.clientY)
    return true
  }

  // Drag-commit. sigplot's Accordion never fires its 'change'/'accordiontag'
  // events on drag-end (its _onDocMouseUp is dead code: `!dragging ||
  // !edge_dragging` is always true since mousedown sets exactly one of them).
  // So we detect a user drag ourselves on document mouseup by reading the live
  // centre/width sigplot writes during _onMouseMove. useDocumentEvent must be
  // called synchronously in setup (it registers onMounted/onUnmounted); the
  // accordions are null until initPlots() runs, hence the guard.
  useDocumentEvent('mouseup', () => {
    if (suppressAccEvents || !specAcc || !wfAcc) return
    if (!dragActive) return // mouseup without a drag we initiated
    commitAccDrag()
  })

  // Safety nets for drags that never get a normal mouseup. A cancelled pointer
  // gesture (browser takes over a touch/pen scroll) or the window losing focus
  // mid-drag (alt-tab, OS dialog) would otherwise leave sigplot's drag flag set
  // and the tuning bar glued to the cursor until a page refresh. Abort (no
  // commit) and snap the brackets back to the tuned state. abortFreqDrag gets
  // the same treatment for the same reasons (the freq-axis pan has no sigplot
  // drag flag to leak, but an uncommitted pan should still snap back rather than
  // leave a stale preview offset on screen).
  useDocumentEvent('pointercancel', abortAccDrag)

  return {
    nearEdge,
    applyMarker,
    attachAccordions,
    detachAccordions,
    isBracketDragActive,
    isWritingBracket,
    tryStartBracketTouch,
    abortAccDrag,
  }
}
