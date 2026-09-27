<template>
  <div class="oma-content-checks">
    <label class="oma-content-check">
      <BaseCheckbox
        :checked="includeBasemap"
        input-class="oma-content-check-input"
        box-class="oma-content-check-box"
        accessible-name="Include basemap tiles"
        :disabled="basemapForceDisabled"
        :described-by-id="basemapForceDisabled ? atLeastOneNoteId : undefined"
        @change="emit('update:includeBasemap', ($event.target as HTMLInputElement).checked)"
      >
        <span class="oma-content-check-label">Basemap</span>
        <span class="oma-content-check-desc">Vector map tiles — roads, water, place names.</span>
      </BaseCheckbox>
    </label>
    <label class="oma-content-check">
      <BaseCheckbox
        :checked="includeTerrain"
        input-class="oma-content-check-input"
        box-class="oma-content-check-box"
        accessible-name="Include terrain data"
        :disabled="terrainForceDisabled"
        :described-by-id="terrainForceDisabled ? atLeastOneNoteId : undefined"
        @change="emit('update:includeTerrain', ($event.target as HTMLInputElement).checked)"
      >
        <span class="oma-content-check-label">Terrain</span>
        <span class="oma-content-check-desc">
          Elevation data for hillshade and contour lines{{
            maxZoom > terrainMaxZoom ? ` (up to z${terrainMaxZoom})` : ''
          }}.
        </span>
      </BaseCheckbox>
    </label>
    <p :id="atLeastOneNoteId" class="oma-content-checks-note">
      At least one of Basemap or Terrain must stay selected. Works offline in DARK, LIGHT and
      COLOUR.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * `ContentChecks` — the Basemap/Terrain checkboxes (D3 in the plan: content
 * checkboxes, not theme checkboxes, because all three basemap themes share
 * the same tiles — unticking a theme would save nothing). At least one must
 * stay ticked, enforced by disabling whichever box is currently the only one
 * ticked, so there is no way to reach "both off" rather than a validation
 * message after the fact.
 */
import { computed, useId } from 'vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'

const props = defineProps<{
  includeBasemap: boolean
  includeTerrain: boolean
  maxZoom: number
  terrainMaxZoom: number
}>()

const emit = defineEmits<{
  'update:includeBasemap': [value: boolean]
  'update:includeTerrain': [value: boolean]
}>()

const atLeastOneNoteId = useId()
const basemapForceDisabled = computed(() => props.includeBasemap && !props.includeTerrain)
const terrainForceDisabled = computed(() => props.includeTerrain && !props.includeBasemap)
</script>

<style scoped>
.oma-content-checks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.oma-content-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.oma-content-check-box {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 1px solid var(--rule);
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.oma-content-check-input:checked + .oma-content-check-box {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.oma-content-check-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.oma-content-check-desc {
  display: block;
  font-size: 11px;
  color: rgba(var(--ink-rgb), 0.65);
}

.oma-content-checks-note {
  margin: 4px 0 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(var(--ink-rgb), 0.65);
}
</style>
