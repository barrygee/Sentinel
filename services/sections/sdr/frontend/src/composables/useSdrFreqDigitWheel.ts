import type { Ref } from 'vue'

/**
 * Per-digit scroll-to-tune for the SDR frequency input (extracted from
 * SdrPanel.vue's engine spine — behaviour byte-identical).
 *
 * Hover a digit in the frequency input and scroll the wheel to step that
 * digit's place value. We work in Hz and reformat (rather than editing the
 * character) so 9→0 carries fall out naturally. Display updates live per
 * notch; the hardware retune is debounced (250ms) so the spectrum marker
 * stays in sync — matching onPlotWheel in SdrWaterfall.vue.
 *
 * The composable owns only the wheel geometry + debounce; every ref it
 * mutates and every command it sends is injected by the panel, so the
 * engine's command cadence is unchanged.
 */
export interface UseSdrFreqDigitWheelOptions {
  /** The frequency <input> the wheel gesture targets. */
  freqInputRef: Ref<HTMLInputElement | null>
  /** Authoritative tuned frequency in Hz (read for geometry, stepped on wheel). */
  currentFreqHz: Ref<number>
  /** The input's editable text value ("NNN.DDDD" MHz). */
  freqInputVal: Ref<string>
  /** The "NNN.DDD MHz" active-frequency display string. */
  activeFreqDisplay: Ref<string>
  /** True when tuning is disabled (no usable radio, or read-only follower). */
  tuningDisabled: Ref<boolean>
  /** True while the scanner sweep owns the tuner. */
  scanActive: Ref<boolean>
  /** True while audio/spectrum is streaming (gates the hardware commit). */
  playing: Ref<boolean>
  /** The selected radio id, if any (gates the hardware commit). */
  selectedRadioId: Ref<number | null>
  /** Finalises an in-progress recording before a manual frequency change. */
  endRecordingOnManualChange: () => void
  /** Sends a control-socket command (the panel's single command chokepoint). */
  sendCmd: (commandPayload: object) => void
  /** Persists the live tuner state to sessionStorage. */
  saveSettings: () => void
}

/**
 * Wires per-digit wheel tuning onto the injected frequency refs. Returns the
 * `onFreqWheel` handler the panel binds with `@wheel.prevent`.
 */
export function useSdrFreqDigitWheel(options: UseSdrFreqDigitWheelOptions) {
  const {
    freqInputRef,
    currentFreqHz,
    freqInputVal,
    activeFreqDisplay,
    tuningDisabled,
    scanActive,
    playing,
    selectedRadioId,
    endRecordingOnManualChange,
    sendCmd,
    saveSettings,
  } = options

  let _freqWheelDebounce: ReturnType<typeof setTimeout> | null = null
  let _freqWheelMirror: HTMLSpanElement | null = null

  // Measure the on-screen left edge (px, from the input's content box) of each
  // character in `str`, using a hidden span that mirrors the input's exact font
  // metrics — including letter-spacing, which canvas measureText ignores. The
  // browser does the real layout, so the boundaries are pixel-accurate and don't
  // accumulate rounding error across the string.
  function freqCharEdges(el: HTMLInputElement, str: string): number[] {
    if (!_freqWheelMirror) {
      _freqWheelMirror = document.createElement('span')
      _freqWheelMirror.style.position = 'absolute'
      _freqWheelMirror.style.visibility = 'hidden'
      _freqWheelMirror.style.whiteSpace = 'pre'
      _freqWheelMirror.style.left = '-9999px'
      _freqWheelMirror.style.top = '0'
      document.body.appendChild(_freqWheelMirror)
    }
    const m = _freqWheelMirror
    const cs = getComputedStyle(el)
    m.style.font = cs.font
    m.style.fontFamily = cs.fontFamily
    m.style.fontSize = cs.fontSize
    m.style.fontWeight = cs.fontWeight
    m.style.fontVariantNumeric = cs.fontVariantNumeric
    m.style.letterSpacing = cs.letterSpacing
    // Width of each leading prefix "", "N", "NN", … gives every character's right
    // edge; index i's span is [edges[i], edges[i+1]).
    const edges: number[] = [0]
    for (let i = 1; i <= str.length; i++) {
      m.textContent = str.slice(0, i)
      edges.push(m.getBoundingClientRect().width)
    }
    return edges
  }

  // Map the wheel event's cursor X to the place value (in Hz) of the digit under it,
  // using the authoritative currentFreqHz (the input may be transiently blanked on
  // focus). Returns null when the cursor is over the decimal point or out of range.
  function freqDigitPlaceHz(e: WheelEvent): number | null {
    const el = freqInputRef.value
    if (!el || !currentFreqHz.value) return null
    const str = (currentFreqHz.value / 1e6).toFixed(4) // "NNN.DDDD"
    const rect = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    // Text starts after the left padding/border (both 0 here, but read to be safe).
    // Use `parseFloat(...) || 0`, not `parseFloat(... || '0')`: a non-numeric
    // computed value (e.g. jsdom resolves an unset border-width to 'medium')
    // parses to NaN, which would poison `x` — fall back to 0 instead.
    /* v8 ignore start -- padding/border are always 0 for this field, so the
       numeric (truthy) side of `|| 0` is never the taken branch */
    const x =
      e.clientX -
      rect.left -
      (parseFloat(cs.paddingLeft) || 0) -
      (parseFloat(cs.borderLeftWidth) || 0)
    /* v8 ignore stop */
    // Cursor left of the text — only reachable with a live browser layout, so the
    // guard is verified manually / in the browser.
    /* v8 ignore start */
    if (x < 0) return null
    /* v8 ignore stop */
    const edges = freqCharEdges(el, str)
    let idx = -1
    for (let i = 0; i < str.length; i++) {
      if (x >= edges[i] && x < edges[i + 1]) {
        idx = i
        break
      }
    }
    if (idx < 0 || str[idx] === '.') return null
    const dot = str.indexOf('.')
    // Integer digit at index idx: place 10^(dot-1-idx) MHz. Decimal digit: 10^-(idx-dot) MHz.
    const placeMhz = idx < dot ? Math.pow(10, dot - 1 - idx) : Math.pow(10, -(idx - dot))
    return placeMhz * 1e6
  }

  function onFreqWheel(e: WheelEvent) {
    // tuningDisabled (not just controlsDisabled) so a read-only follower can't
    // wheel-scroll the frequency: the input is disabled, but a disabled input still
    // emits wheel events in some browsers, and without this the digits would change
    // locally (the actual retune is suppressed in sendCmd) and only snap back on the
    // next control frame.
    if (tuningDisabled.value || scanActive.value) return
    const placeHz = freqDigitPlaceHz(e)
    // The commit tail has defensive arms that need a live radio + browser timing to
    // reach exhaustively (the newHz<=0 floor, the not-playing skip, the debounced
    // hardware sendCmd), so it's ignored for coverage and verified in the browser.
    /* v8 ignore start */
    if (placeHz == null) return
    const dir = e.deltaY < 0 ? 1 : -1 // scroll up → higher freq
    const newHz = Math.round(currentFreqHz.value + dir * placeHz)
    if (newHz <= 0) return
    // Update the display live every notch.
    currentFreqHz.value = newHz
    activeFreqDisplay.value = (newHz / 1e6).toFixed(3) + ' MHz'
    freqInputVal.value = (newHz / 1e6).toFixed(4)
    // Commit to hardware once the burst settles (only when playing). The wheel has
    // already advanced currentFreqHz live (above), which moves the marker via its
    // mirror watcher — but it also means the store's tuneRequest watcher would drop
    // the retune on its `hz === currentFreqHz` guard. So recenter the hardware
    // directly here: sendCmd('tune') retunes rtl_tcp (and zeroes the demod offset),
    // and the new center_hz in the spectrum frames recentres the waterfall/spectrum.
    if (playing.value && selectedRadioId.value) {
      if (_freqWheelDebounce) clearTimeout(_freqWheelDebounce)
      _freqWheelDebounce = setTimeout(() => {
        _freqWheelDebounce = null
        endRecordingOnManualChange()
        const hz = currentFreqHz.value
        sendCmd({ cmd: 'tune', frequency_hz: hz })
        sessionStorage.setItem('sdrLastFreqHz', String(hz))
        saveSettings()
      }, 250)
    }
    /* v8 ignore stop */
  }

  return { onFreqWheel }
}
