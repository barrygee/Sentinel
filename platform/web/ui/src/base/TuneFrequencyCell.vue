<template>
  <button
    type="button"
    class="tune-frequency-cell"
    :title="sdrConnected ? `Tune to ${frequency} ${mode}` : 'Connect an SDR to tune'"
    @click.stop="emit('tune')"
  >
    <BaseDataCell :label="modePlacement === 'label' ? `${label} · ${mode}` : label">
      {{ frequency
      }}<span v-if="modePlacement === 'value'" class="ba-data-cell-mode"> · {{ mode }}</span>
    </BaseDataCell>
  </button>
</template>

<script setup lang="ts">
/**
 * `TuneFrequencyCell` — a `BaseDataCell` that is also a button asking the
 * parent to tune the SDR to the frequency it shows. Shared by the Air pane's
 * airport frequencies, the Land pane's repeater output/input cells and the Sea
 * pane's port VHF channels, which each used to style their own copy.
 *
 * The parent does the tuning (and decides what to do when no SDR is
 * connected); this component only renders the cell and emits `tune`. The
 * click doesn't bubble, so it never toggles the list row the cell sits in.
 */
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'

interface TuneFrequencyCellProps {
  /** The cell's caption, e.g. "TOWER" or "OUTPUT", rendered as given. */
  label: string
  /** The frequency as displayed, e.g. "118.700" (no unit). */
  frequency: string
  /** SDR demodulation mode the frequency tunes with, e.g. "AM". */
  mode: string
  /** Whether an SDR is connected; only changes the hover title. */
  sdrConnected: boolean
  /**
   * Where the mode is shown: after the value (" · AM", the default) or after
   * the label ("OUTPUT · NFM"), for cells too narrow to fit a long frequency
   * and its mode on one line.
   */
  modePlacement?: 'value' | 'label'
}

withDefaults(defineProps<TuneFrequencyCellProps>(), { modePlacement: 'value' })
const emit = defineEmits<{ tune: [] }>()
</script>

<style scoped>
.tune-frequency-cell {
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

.tune-frequency-cell:hover {
  opacity: 0.7;
}

.tune-frequency-cell:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .tune-frequency-cell {
    transition: none;
  }
}
</style>
