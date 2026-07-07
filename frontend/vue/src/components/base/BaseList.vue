<script setup lang="ts">
import { ref } from 'vue'

/**
 * `BaseList` — the shared "wrapper + empty state + rows" scaffold behind the
 * list-shaped panels that recur across the app (`TrackingPanel.vue`'s tracked
 * items, `SdrRecordingsSection.vue`'s recordings, `SpacePasses.vue`'s upcoming
 * passes, `AirFilter.vue`/`SpaceFilter.vue`'s search results). Only the
 * genuinely shared shape is extracted here: whether the list is empty is a
 * caller decision (it usually depends on more than one data source — e.g.
 * TrackingPanel's `store.count`), so `isEmpty` is a prop rather than something
 * this component infers from its slot content.
 *
 * The scroll container itself (height, `overflow-y`, scrollbar hiding) is
 * intentionally left to the caller/teleport-target styling (e.g.
 * `MapSidebar.vue`'s `#msb-pane-*` rules) since several consumers render into a
 * teleported pane whose surrounding chrome already owns that box — duplicating
 * it here would fight that ancestor for the same scroll behaviour.
 *
 * The empty-state look genuinely differs per site today (TrackingPanel's
 * `#msb-tracking-empty`, SpaceFilter's `.space-filter-no-results`, …, each with
 * its own padding/colour) — this component only supplies a plain default look
 * for `emptyText` when no `#empty` slot is given. When a caller *does* supply
 * an `#empty` slot (to keep its own pre-existing id/class and external CSS,
 * e.g. TrackingPanel's `#msb-tracking-empty` rule in `MapSidebar.vue`), that
 * markup renders unwrapped — so a caller's own padding/styling is never
 * doubled up inside this component's own empty-state box.
 *
 * ## Scroll container exposure
 * A caller occasionally needs raw DOM measurements off the actual scrolling
 * element — e.g. a "scroll for more" hint that reads `scrollHeight` /
 * `clientHeight` / `scrollTop` (see `SdrRecordingsSection.vue`). Rather than
 * have that caller reach for the component's `$el` (fragile: breaks if this
 * template ever grows a wrapper or the root element changes), `BaseList`
 * exposes its root element as `scrollContainer` via `defineExpose`. This is
 * the established convention for base components in this app that own the
 * element a caller may need direct DOM access to: expose a named, typed
 * handle rather than the opaque `$el`. A caller obtains it through a
 * component template ref, e.g.
 * `const listRef = ref<InstanceType<typeof BaseList> | null>(null)`, then
 * reads `listRef.value?.scrollContainer`.
 *
 * Non-prop attributes (an `id`, a `@scroll` listener, …) fall through to this
 * single root element automatically, same as any other Vue 3 SFC with one
 * root node — no extra wiring needed for a caller to attach those directly to
 * the scroll container.
 */
interface BaseListProps {
  /** Whether the list has no items to show. Callers compute this themselves
   * (e.g. `store.count === 0`) rather than this component inferring it from
   * slot content, since "empty" can depend on more than the rendered rows. */
  isEmpty: boolean
  /** Plain-text message shown when `isEmpty` is true and no `#empty` slot is
   * given, e.g. "No tracked items". */
  emptyText: string
}

defineProps<BaseListProps>()

const scrollContainer = ref<HTMLDivElement | null>(null)

defineExpose({ scrollContainer })
</script>

<template>
  <div ref="scrollContainer" class="ba-list">
    <div v-if="isEmpty && !$slots.empty" class="ba-list-empty">{{ emptyText }}</div>
    <slot v-else-if="isEmpty" name="empty" />
    <slot v-else />
  </div>
</template>

<style scoped>
.ba-list {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.ba-list-empty {
  padding: 7px 14px;
  font-family: var(--font-primary);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.18);
  text-align: center;
}
</style>
