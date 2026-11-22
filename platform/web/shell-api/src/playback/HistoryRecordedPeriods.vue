<template>
  <p v-if="!periods.length" class="history-periods-empty">Nothing recorded yet</p>
  <ul v-else class="history-periods">
    <li v-for="period in shown" :key="period.start" class="history-period">
      <span class="history-period-range">{{ formatPeriod(period.start, period.end) }}</span>
      <span class="history-period-source">{{ formatSources(period.sources) }}</span>
    </li>
    <li v-if="hiddenCount" class="history-period history-period--more">
      + {{ hiddenCount }} earlier {{ hiddenCount === 1 ? 'stretch' : 'stretches' }}
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * The stretches a section has recorded so far, newest first, each with the
 * feed that recorded it. Long histories show the most recent few and count
 * the rest.
 */
import { computed } from 'vue'
import {
  formatPeriod,
  formatSources,
  type RecordedPeriod,
} from '@sentinel/shell-api/playback/historySummary'

const props = withDefaults(defineProps<{ periods: RecordedPeriod[]; limit?: number }>(), {
  limit: 5,
})

const newestFirst = computed(() => [...props.periods].reverse())
const shown = computed(() => newestFirst.value.slice(0, props.limit))
const hiddenCount = computed(() => Math.max(0, props.periods.length - props.limit))
</script>

<style scoped>
.history-periods {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.history-period {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  font-family: var(--font-primary);
  font-size: var(--settings-text-small);
  color: var(--ink-strong);
  font-variant-numeric: tabular-nums;
}
.history-period-source {
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--ink-secondary);
}
.history-period--more,
.history-periods-empty {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--settings-text-small);
  color: var(--ink-secondary);
}
</style>
