<script setup lang="ts">
/**
 * The Zoom / Max / Min slider column on the waterfall's right edge. Zoom is the
 * horizontal (frequency) zoom; Max and Min are the dB range shared by the
 * spectrum trace and the waterfall colour map (SDR++ semantics).
 */
import './SdrWaterfallViewSliders.css'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ZOOM_MAX, ZOOM_MIN } from './composables/useWaterfallViewRange'

defineProps<{
  /** True while the radio isn't playing or a search/scan sweeps. */
  disabled: boolean
}>()

/** Horizontal zoom, 1 (full span) to ZOOM_MAX. */
const zoom = defineModel<number>('zoom', { required: true })
/** The dB ceiling (0 or below). */
const zmax = defineModel<number>('zmax', { required: true })
/** The dB floor. */
const zmin = defineModel<number>('zmin', { required: true })

// The sliders are rotated -90deg, which puts the slider's native `min`
// attribute at the TOP and `max` at the BOTTOM of the visual track. To make
// "thumb DOWN = more negative dB" feel natural, bind each slider to the
// negated value via a computed proxy: the slider stores a positive magnitude
// (0..80 for Max, 20..120 for Min), negated on read/write so the models still
// carry the actual dB values.
const zmaxSlider = computed({
  get: () => -zmax.value,
  set: (sliderValue: number) => {
    zmax.value = -sliderValue
  },
})
const zminSlider = computed({
  get: () => -zmin.value,
  set: (sliderValue: number) => {
    zmin.value = -sliderValue
  },
})

const controlsEl = ref<HTMLElement | null>(null)

// Each rotated slider's CSS `width` must equal its wrapper's pixel HEIGHT for
// it to span the column. Measure the wrappers and push the length into a
// per-slider CSS var.
let controlsRo: ResizeObserver | null = null
function sizeSliders() {
  const root = controlsEl.value
  if (!root) return
  root.querySelectorAll<HTMLElement>('.sdr-wf-slider-wrap').forEach((wrap) => {
    const slider = wrap.querySelector<HTMLElement>('.sdr-wf-slider')
    // The template always renders a .sdr-wf-slider inside every .sdr-wf-slider-
    // wrap, so the query never misses.
    /* v8 ignore start */
    if (slider) slider.style.setProperty('--wf-slider-len', `${wrap.clientHeight}px`)
    /* v8 ignore stop */
  })
}

onMounted(() => {
  // Size the sliders once layout settles, then keep them in sync as the column
  // height changes (panel toggle, window resize, footer/nav).
  requestAnimationFrame(sizeSliders)
  // controlsEl is a template ref that is always populated by the time onMounted
  // runs, so the null arm never executes.
  /* v8 ignore start */
  if (controlsEl.value) {
    controlsRo = new ResizeObserver(sizeSliders)
    controlsRo.observe(controlsEl.value)
  }
  /* v8 ignore stop */
})

onBeforeUnmount(() => {
  controlsRo?.disconnect()
  controlsRo = null
})
</script>

<template>
  <div ref="controlsEl" class="sdr-wf-controls">
    <div class="sdr-wf-ctl">
      <span class="sdr-wf-ctl-label">Zoom</span>
      <div class="sdr-wf-slider-wrap">
        <input
          v-model.number="zoom"
          class="sdr-wf-slider"
          type="range"
          :min="ZOOM_MIN"
          :max="ZOOM_MAX"
          step="0.5"
          :disabled="disabled"
          :aria-label="`Zoom ${zoom}x`"
        />
      </div>
    </div>
    <div class="sdr-wf-ctl">
      <span class="sdr-wf-ctl-label">Max</span>
      <div class="sdr-wf-slider-wrap">
        <input
          v-model.number="zmaxSlider"
          class="sdr-wf-slider"
          type="range"
          min="0"
          max="80"
          step="1"
          :disabled="disabled"
          :aria-label="`Max ${zmax} dB`"
        />
      </div>
    </div>
    <div class="sdr-wf-ctl">
      <span class="sdr-wf-ctl-label">Min</span>
      <div class="sdr-wf-slider-wrap">
        <input
          v-model.number="zminSlider"
          class="sdr-wf-slider"
          type="range"
          min="20"
          max="120"
          step="1"
          :disabled="disabled"
          :aria-label="`Min ${zmin} dB`"
        />
      </div>
    </div>
  </div>
</template>
