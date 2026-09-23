<template>
  <div class="lrfc">
    <button
      type="button"
      class="lrfc-tune"
      :title="sdrConnected ? `Tune to ${frequencyText} ${mode}` : 'Connect an SDR to tune'"
      @click.stop="emit('tune')"
    >
      <!-- The mode goes in the label rather than after the value: a 4-place
           frequency already fills a three-column cell. -->
      <BaseDataCell :label="`${label} · ${mode}`" :value="frequencyText" />
    </button>
    <BaseIconAction
      class="lrfc-save"
      :class="{ 'lrfc-save--saved': saved }"
      :accessible-name="
        saved
          ? `Remove ${frequencyText} ${mode} from the frequency manager`
          : `Save ${frequencyText} ${mode} to the frequency manager`
      "
      :tooltip="saved ? 'REMOVE FREQUENCY' : 'SAVE FREQUENCY'"
      :tooltip-side="tooltipSide"
      :aria-pressed="saved"
      @click.stop="onBookmarkClick"
    >
      <!-- A bookmark: filled while the frequency is stored (click removes it),
           outlined until then (click saves it). -->
      <svg
        width="12"
        height="14"
        viewBox="0 0 12 14"
        :fill="saved ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M1.5 1.5h9v11L6 9.5 1.5 12.5z" />
      </svg>
    </BaseIconAction>
  </div>
</template>

<script setup lang="ts">
/**
 * One tunable frequency of a repeater channel in the Land FILTER pane — the
 * OUTPUT or INPUT cell. The cell itself is a button that asks the parent to
 * tune the SDR (the Land take on the Sea pane's port channel cells and the
 * Air pane's airport frequencies), with a bookmark beside it that saves the
 * frequency to the SDR Frequency Manager; the bookmark fills once the
 * frequency is stored, and clicking it then removes the frequency again.
 */
import { computed } from 'vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import BaseIconAction from '@/components/base/BaseIconAction.vue'
import { formatMhz } from '@/constants/repeaters'

const props = withDefaults(
  defineProps<{
    label: string
    mhz: number
    /** SDR demodulation mode the frequency tunes with. */
    mode: string
    sdrConnected: boolean
    /** Whether the Frequency Manager already holds this frequency. */
    saved: boolean
    /**
     * Where the bookmark's tooltip opens. The pane is narrow: a cell in the
     * first column has room to its right (`top`, left-aligned to the icon), one
     * further along only has room to its left (`left`).
     */
    tooltipSide?: 'top' | 'left'
  }>(),
  { tooltipSide: 'top' },
)
const emit = defineEmits<{ tune: []; save: []; unsave: [] }>()

const frequencyText = computed(() => formatMhz(props.mhz).replace(' MHz', ''))

/** The bookmark toggles: save while unsaved, remove once saved. */
function onBookmarkClick(): void {
  if (props.saved) emit('unsave')
  else emit('save')
}
</script>

<style scoped>
.lrfc {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  min-width: 0;
}
.lrfc-tune {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  color: inherit;
  font: inherit;
  min-width: 0;
  transition: opacity 0.12s;
}
.lrfc-tune:hover {
  opacity: 0.7;
}
.lrfc-tune:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.lrfc-save {
  /* Anchors the BaseIconAction tooltip to the icon (the component leaves
     `position` to its adopters). */
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 24px is the WCAG 2.2 AA minimum target (2.5.8 Target Size (Minimum)); the
     bookmark glyph inside stays 12×14, so only the hit area grows. Relying on
     the spacing exception instead would be marginal — the tune button sits
     6px away in the same grid cell. */
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  /* Sits on the value line, under the cell's label. */
  margin-bottom: 3px;
  color: rgba(var(--ink-rgb), 0.45);
}
.lrfc-save:disabled {
  cursor: default;
}
.lrfc-save:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.lrfc-save:hover:not(:disabled) {
  color: var(--accent-text);
}
.lrfc-save--saved {
  color: var(--accent-text);
  opacity: 0.8;
}
@media (prefers-reduced-motion: reduce) {
  .lrfc-tune {
    transition: none;
  }
}
</style>
