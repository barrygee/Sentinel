<template>
  <form class="playback-jump" @submit.prevent="submit">
    <label class="playback-jump-label" :for="inputId">GO TO (UTC)</label>
    <input
      :id="inputId"
      v-model="draft"
      class="playback-jump-input"
      type="datetime-local"
      :min="toUtcInputValue(rangeStart)"
      :max="toUtcInputValue(rangeEnd)"
      step="60"
    />
    <BasePillToggle class="playback-pill" type="submit" aria-label="Go to this date and time"
      >GO</BasePillToggle
    >
  </form>
</template>

<script setup lang="ts">
/**
 * Jump straight to a date and time, typed in UTC. Out-of-range moments are
 * clamped by whoever handles `seek`, so an early date lands on the oldest
 * recorded moment rather than doing nothing.
 */
import '@sentinel/ui/playback/playbackControls.css'
import { ref, useId, watch } from 'vue'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import { fromUtcInputValue, toUtcInputValue } from '@sentinel/ui/utils/playbackTime'

const props = defineProps<{ rangeStart: number; rangeEnd: number; value: number }>()
const emit = defineEmits<{ seek: [epochMs: number] }>()

const inputId = `playback-jump-${useId()}`
const draft = ref(toUtcInputValue(props.value))

// Follow the cursor after a seek elsewhere (scrubber, steps), but not while
// playing every second — that would fight someone typing.
watch(
  () => Math.floor(props.value / 60_000),
  () => {
    if (document.activeElement?.id !== inputId) draft.value = toUtcInputValue(props.value)
  },
)

function submit(): void {
  const epochMs = fromUtcInputValue(draft.value)
  if (epochMs !== null) emit('seek', epochMs)
}
</script>

<style scoped>
.playback-jump {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.playback-jump-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--rail-ink-muted);
  white-space: nowrap;
}
.playback-jump-input {
  font: inherit;
  font-size: 12px;
  min-height: 24px;
  padding: 2px 4px;
  color: var(--rail-ink);
  background: var(--rail-surface);
  border: 1px solid var(--rail-border);
  color-scheme: dark light;
}
.playback-jump-input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
