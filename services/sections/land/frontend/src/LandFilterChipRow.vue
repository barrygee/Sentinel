<template>
  <div class="lfc-row" role="group" :aria-label="label">
    <span class="lfc-label">{{ label }}</span>
    <div class="lfc-chips">
      <BaseChip
        v-for="option in options"
        :key="option.key"
        :active="option.active"
        :aria-pressed="option.active"
        :disabled="option.disabled"
        :title="option.title"
        @click="emit('toggle', option.key)"
      >
        {{ option.label }}
      </BaseChip>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `LandFilterChipRow` — one labelled row of multi-select toggle chips in the
 * Land FILTER pane (the LAYERS row, the repeater BAND and MODE rows). Each
 * chip is an independent `aria-pressed` toggle; the row is a named group so a
 * screen reader hears which set a chip belongs to. The chips are `BaseChip`,
 * the same as the Space pane's pass categories and the SDR scan groups.
 */
import BaseChip from '@sentinel/ui/base/BaseChip.vue'

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
  color: rgba(var(--ink-rgb), 0.35);
}
.lfc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
