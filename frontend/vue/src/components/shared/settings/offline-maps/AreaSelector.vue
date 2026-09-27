<template>
  <div class="oma-area-selector">
    <div class="oma-area-selector-buttons">
      <BaseButton
        type="button"
        variant="ghost"
        :active="armed"
        :aria-pressed="armed"
        @click="emit('toggle-draw')"
      >
        {{ armed ? 'CANCEL DRAWING' : 'DRAW AREA' }}
      </BaseButton>
      <BaseButton type="button" variant="ghost" @click="useCurrentView">
        USE CURRENT VIEW
      </BaseButton>
    </div>
    <p class="oma-area-selector-keyboard-note">
      Using a keyboard or screen reader: drawing on the map isn't operable that way — enter the
      North/South/East/West bounds below instead, or use Use Current View.
    </p>
    <!-- Always present (not v-if) so the text CHANGE is what triggers the polite
         announcement — some assistive tech announces a live region's content
         changing more reliably than a whole node being inserted with content
         already in it. Not role="status": a second status region elsewhere in
         the app trips Playwright's strict-mode "exactly one match" locators
         (see CLAUDE.md), and aria-live="polite" alone is the correct role-less
         equivalent here. -->
    <p class="oma-area-selector-hint" aria-live="polite">
      {{
        armed
          ? 'Drawing armed. Drag a corner to the opposite corner, or tap once per corner. Press Escape to cancel.'
          : ''
      }}
    </p>
    <p v-if="currentViewError" class="oma-area-selector-error" role="alert">
      {{ currentViewError }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * `AreaSelector` — the "DRAW AREA" / "USE CURRENT VIEW" pair above
 * `BboxFields`. Neither button touches the map directly: `DRAW AREA` toggles
 * `RectangleDrawHandler` on `OfflineAreaMap` (armed there, via the parent's
 * exposed ref); "USE CURRENT VIEW" reads the map's bounds through
 * `getCurrentViewBounds` and validates them here — the one MapLibre-free spot
 * that knows what a "usable" bbox means to *this* form (no antimeridian
 * crossing, since v1 rejects rather than splitting it, per the BUILD CONTRACT).
 */
import { ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import type { LngLatBounds } from './rectangleDrawHandler'

const props = defineProps<{
  /** Whether the draw handler is currently armed (drives the button's label/pressed state). */
  armed: boolean
  /** Reads the settings map's current visible bounds; `null` if the map isn't ready. */
  getCurrentViewBounds: () => LngLatBounds | null
}>()

const emit = defineEmits<{
  'toggle-draw': []
  'area-selected': [bounds: LngLatBounds]
}>()

const currentViewError = ref<string | null>(null)

function useCurrentView(): void {
  const bounds = props.getCurrentViewBounds()
  if (!bounds) {
    currentViewError.value = 'The map is not ready yet.'
    return
  }
  if (bounds.west >= bounds.east) {
    currentViewError.value =
      'The current view crosses the antimeridian (180°) — pan or zoom in so the visible area sits on one side of it, then try again.'
    return
  }
  currentViewError.value = null
  emit('area-selected', bounds)
}
</script>

<style scoped>
.oma-area-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oma-area-selector-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.oma-area-selector-keyboard-note {
  margin: 0;
  font-size: 11px;
  color: rgba(var(--ink-rgb), 0.65);
}

.oma-area-selector-hint {
  margin: 0;
  min-height: 1.4em;
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--ink-rgb), 0.65);
}

.oma-area-selector-error {
  margin: 0;
  font-size: 11px;
  color: var(--danger);
}
</style>
