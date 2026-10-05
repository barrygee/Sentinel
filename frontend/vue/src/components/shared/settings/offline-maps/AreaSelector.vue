<template>
  <div class="oma-area-selector">
    <div class="oma-area-selector-buttons">
      <!-- One button through the area's life: DRAW AREA (a toggle — pressed
           while drawing, pressing again cancels), then CLEAR AREA once a box
           has been drawn. Only the toggle state carries aria-pressed. -->
      <BaseButton
        type="button"
        variant="ghost"
        :active="armed"
        :aria-pressed="showsClear ? undefined : armed"
        :aria-describedby="showsClear ? undefined : keyboardNoteId"
        @click="showsClear ? emit('clear') : emit('toggle-draw')"
      >
        {{ showsClear ? 'CLEAR AREA' : 'DRAW AREA' }}
      </BaseButton>
      <!-- Off while drawing or while a box exists: the area comes from one
           source at a time. Back on once the area is cleared or saved (queuing
           a download clears it). -->
      <BaseButton
        type="button"
        variant="ghost"
        :disabled="armed || hasArea"
        @click="useCurrentView"
      >
        USE CURRENT VIEW
      </BaseButton>
    </div>
    <!-- Screen readers only: drawing and resizing on the map need a pointer,
         so point keyboard users at the equivalent fields (WCAG 2.5.7). -->
    <p :id="keyboardNoteId" class="sr-only">
      Drawing on the map needs a mouse or touch. Keyboard users can enter the North, South, East and
      West bounds below, or use Use Current View.
    </p>
    <p v-if="currentViewError" class="settings-location-error oma-area-selector-error" role="alert">
      {{ currentViewError }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * `AreaSelector` — the draw and "USE CURRENT VIEW" buttons above `BboxFields`.
 * The draw button reads "DRAW AREA" (pressed while drawing; pressing it again
 * cancels), then "CLEAR AREA" once a box has been drawn. Neither button touches
 * the map directly: `DRAW AREA` toggles
 * `RectangleDrawHandler` on `OfflineAreaMap` (armed there, via the parent's
 * exposed ref); "USE CURRENT VIEW" reads the map's bounds through
 * `getCurrentViewBounds` and validates them here — the one MapLibre-free spot
 * that knows what a "usable" bbox means to *this* form (no antimeridian
 * crossing, since v1 rejects rather than splitting it, per the BUILD CONTRACT).
 */
import { computed, ref, useId } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { LngLatBounds } from './rectangleDrawHandler'

const props = defineProps<{
  /** Whether the draw handler is currently armed (drives the button's label/highlight). */
  armed: boolean
  /** Reads the settings map's current visible bounds; `null` if the map isn't ready. */
  getCurrentViewBounds: () => LngLatBounds | null
  /** Whether an area is currently selected (turns the draw button into CLEAR AREA). */
  hasArea: boolean
}>()

const emit = defineEmits<{
  /** Arm the map's rectangle-draw handler, or disarm it if already armed. */
  'toggle-draw': []
  'area-selected': [bounds: LngLatBounds]
  /** Remove the selected area. */
  clear: []
}>()

const keyboardNoteId = useId()
/** The draw button clears instead once a box has actually been drawn. */
const showsClear = computed(() => props.hasArea)
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
  /* Tight like the ONLINE / OFF GRID segmented pair. */
  gap: 2px;
}
</style>
