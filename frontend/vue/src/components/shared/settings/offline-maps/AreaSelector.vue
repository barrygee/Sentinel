<template>
  <div class="oma-area-selector">
    <div class="oma-area-selector-buttons">
      <BaseButton
        type="button"
        variant="ghost"
        :active="armed"
        :aria-pressed="armed"
        :aria-describedby="keyboardNoteId"
        @click="emit('toggle-draw')"
      >
        {{ armed ? 'CANCEL DRAWING' : 'DRAW AREA' }}
      </BaseButton>
      <BaseButton type="button" variant="ghost" @click="useCurrentView">
        USE CURRENT VIEW
      </BaseButton>
      <BaseButton type="button" variant="ghost" :disabled="!hasArea" @click="emit('clear')">
        CLEAR AREA
      </BaseButton>
    </div>
    <!-- Screen readers only: drawing and resizing on the map need a pointer,
         so point keyboard users at the equivalent fields (WCAG 2.5.7). -->
    <p :id="keyboardNoteId" class="sr-only">
      Drawing on the map needs a mouse or touch. Keyboard users can enter the North, South, East and
      West bounds below, or use Use Current View.
    </p>
    <!-- Always present (not v-if) so the text CHANGE is what triggers the polite
         announcement. Not role="status": a second status region elsewhere in
         the app trips Playwright's strict-mode locators (see CLAUDE.md). -->
    <p class="settings-location-hint oma-area-selector-hint" aria-live="polite">
      {{
        armed
          ? 'Drag from one corner to the opposite corner, or tap each corner. Press Escape to cancel.'
          : ''
      }}
    </p>
    <p v-if="currentViewError" class="settings-location-error oma-area-selector-error" role="alert">
      {{ currentViewError }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * `AreaSelector` — the "DRAW AREA" / "USE CURRENT VIEW" / "CLEAR AREA" buttons above
 * `BboxFields`. Neither button touches the map directly: `DRAW AREA` toggles
 * `RectangleDrawHandler` on `OfflineAreaMap` (armed there, via the parent's
 * exposed ref); "USE CURRENT VIEW" reads the map's bounds through
 * `getCurrentViewBounds` and validates them here — the one MapLibre-free spot
 * that knows what a "usable" bbox means to *this* form (no antimeridian
 * crossing, since v1 rejects rather than splitting it, per the BUILD CONTRACT).
 */
import { ref, useId } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import type { LngLatBounds } from './rectangleDrawHandler'

const props = defineProps<{
  /** Whether the draw handler is currently armed (drives the button's label/pressed state). */
  armed: boolean
  /** Reads the settings map's current visible bounds; `null` if the map isn't ready. */
  getCurrentViewBounds: () => LngLatBounds | null
  /** Whether an area is currently selected (enables CLEAR AREA). */
  hasArea: boolean
}>()

const emit = defineEmits<{
  'toggle-draw': []
  'area-selected': [bounds: LngLatBounds]
  /** Remove the selected area. */
  clear: []
}>()

const keyboardNoteId = useId()
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
</style>
