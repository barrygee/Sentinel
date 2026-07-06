<script setup lang="ts">
/**
 * `BaseListItem` — a single row inside a `BaseList`. Owns only the two
 * behaviours that recur across the app's list rows: an `interactive` hover/
 * cursor affordance for rows that respond to a click (e.g. SpaceFilter's/
 * AirFilter's search-result options), and a persistent `active` highlight for
 * a selected/expanded row (e.g. a keyboard-focused or expanded search result).
 *
 * Callers compose their own internal layout via the default slot — rows in
 * this app range from a single line to multi-section accordion cards
 * (TrackingPanel, SdrRecordingsSection), so this component does not impose a
 * fixed header/body structure. An optional `actions` slot is available for
 * rows that want a distinct trailing-controls region (e.g. a dismiss button)
 * rendered after the main content.
 */
interface BaseListItemProps {
  /** Adds hover/cursor affordances for rows that respond to a click. Defaults
   * to false. */
  interactive?: boolean
  /** Persistent highlighted state (e.g. keyboard focus or an expanded row).
   * Meaningful whether or not `interactive` is set. Defaults to false. */
  active?: boolean
}

withDefaults(defineProps<BaseListItemProps>(), {
  interactive: false,
  active: false,
})
</script>

<template>
  <div
    class="ba-list-item"
    :class="{ 'ba-list-item--interactive': interactive, 'ba-list-item--active': active }"
  >
    <slot />
    <div v-if="$slots.actions" class="ba-list-item-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.ba-list-item {
  width: 100%;
  box-sizing: border-box;
}

.ba-list-item--interactive {
  cursor: pointer;
  transition: background 0.12s;
}

.ba-list-item--interactive:hover,
.ba-list-item--active {
  background: rgba(255, 255, 255, 0.04);
}

.ba-list-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
