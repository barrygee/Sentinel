<template>
  <BasePillToggle
    v-if="as === 'button'"
    class="base-chip"
    :active="active"
    active-class="base-chip--active"
  >
    <slot />
  </BasePillToggle>
  <span v-else class="base-chip" :class="{ 'base-chip--active': active }">
    <slot />
  </span>
</template>

<script setup lang="ts">
/**
 * `BaseChip` — the small uppercase filter chip: SDR scan groups, Space pass
 * categories and Land's layer, band and mode filters. As a button (the
 * default) it is a `BasePillToggle` with the shared chip look; `disabled`,
 * `title`, `aria-pressed` and the click handler fall through to it, so the
 * caller keeps owning state and ARIA. `as="span"` renders the same look as a
 * non-interactive label, for chips that only show a selection (the waterfall's
 * Scanning overlay).
 */
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'

withDefaults(
  defineProps<{
    /** Whether the chip is selected. */
    active?: boolean
    /** `button` for a toggle chip, `span` for a display-only one. */
    as?: 'button' | 'span'
  }>(),
  { active: false, as: 'button' },
)
</script>

<style>
.base-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 14px;
  background: rgba(var(--ink-rgb), 0.06);
  border: 1px solid transparent;
  border-radius: 2px;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.7);
  transition:
    color 0.15s,
    background 0.15s;
}

button.base-chip {
  cursor: pointer;
}

button.base-chip:hover:not(:disabled) {
  background: rgba(var(--ink-rgb), 0.12);
  color: var(--accent-text);
}

button.base-chip:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.base-chip.base-chip--active {
  color: var(--accent-text);
  background: rgba(var(--accent-rgb), 0.12);
}

button.base-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .base-chip {
    transition: none;
  }
}
</style>
