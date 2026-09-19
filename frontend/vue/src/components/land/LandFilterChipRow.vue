<template>
  <div class="lfc-row" role="group" :aria-label="label">
    <span class="lfc-label">{{ label }}</span>
    <div class="lfc-chips">
      <BasePillToggle
        v-for="option in options"
        :key="option.key"
        class="lfc-chip"
        :active="option.active"
        active-class="lfc-chip-active"
        :aria-pressed="option.active"
        :disabled="option.disabled"
        :title="option.title"
        @click="emit('toggle', option.key)"
      >
        {{ option.label }}
      </BasePillToggle>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `LandFilterChipRow` — one labelled row of multi-select toggle chips in the
 * Land FILTER pane (the LAYERS row, the repeater BAND and MODE rows). Each
 * chip is an independent `aria-pressed` toggle; the row is a named group so a
 * screen reader hears which set a chip belongs to. Styled to match the Space
 * pane's pass-category chips.
 */
import BasePillToggle from '@/components/base/BasePillToggle.vue'

export interface FilterChipOption {
  key: string
  label: string
  active: boolean
  /** Greyed out with `title` explaining why (e.g. APRS with no SDR chosen). */
  disabled?: boolean
  title?: string
}

defineProps<{
  label: string
  options: FilterChipOption[]
}>()

const emit = defineEmits<{ toggle: [key: string] }>()
</script>

<style scoped>
.lfc-row {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 24px 0;
}
.lfc-label {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}
.lfc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.lfc-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  border-radius: 2px;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.lfc-chip:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #c8ff00;
}
.lfc-chip:focus-visible {
  outline: 2px solid #c8ff00;
  outline-offset: 1px;
}
.lfc-chip.lfc-chip-active {
  color: #c8ff00;
  background: rgba(200, 255, 0, 0.12);
}
.lfc-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .lfc-chip {
    transition: none;
  }
}
</style>
