<template>
  <div class="oma-content-checks">
    <BaseCheckbox
      v-for="option in options"
      :key="option.key"
      class="oma-content-check"
      input-class="oma-content-check-input"
      box-class="oma-content-check-box"
      :checked="option.checked"
      :accessible-name="option.accessibleName"
      :disabled="option.forceDisabled"
      @change="option.update(($event.target as HTMLInputElement).checked)"
    >
      <template #checkmark>
        <svg
          v-if="option.checked"
          width="10"
          height="7"
          viewBox="0 0 8 5"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 2.5L3 4.5L7 0.5"
            stroke="#0a0c10"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </template>
      <span class="oma-content-check-text">
        <span class="oma-content-check-label">{{ option.label }}</span>
        <span class="oma-content-check-desc">{{ option.description }}</span>
      </span>
    </BaseCheckbox>
  </div>
</template>

<script setup lang="ts">
/**
 * `ContentChecks` — the Basemap/Terrain checkboxes (D3 in the plan: content
 * checkboxes, not theme checkboxes, because all three basemap themes share
 * the same tiles — unticking a theme would save nothing). At least one must
 * stay ticked: whichever box is the only one ticked is disabled, and the
 * store ignores a request to untick it, so there is no way to reach "both off"
 * rather than a validation message after the fact.
 */
import { computed } from 'vue'
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

const basemapForceDisabled = computed(() => props.includeBasemap && !props.includeTerrain)
const terrainForceDisabled = computed(() => props.includeTerrain && !props.includeBasemap)

/** The two choices, rendered from one template so they can't drift apart. */
const options = computed(() => [
  {
    key: 'basemap',
    label: 'Basemap',
    description: 'Vector map tiles — roads, water, place names.',
    accessibleName: 'Include basemap tiles',
    checked: props.includeBasemap,
    forceDisabled: basemapForceDisabled.value,
    update: (checked: boolean) => emit('update:includeBasemap', checked),
  },
  {
    key: 'terrain',
    label: 'Terrain',
    description: `Elevation data for contour lines${
      props.maxZoom > props.terrainMaxZoom ? ` (up to z${props.terrainMaxZoom})` : ''
    }.`,
    accessibleName: 'Include terrain data',
    checked: props.includeTerrain,
    forceDisabled: terrainForceDisabled.value,
    update: (checked: boolean) => emit('update:includeTerrain', checked),
  },
])
</script>

<style scoped>
.oma-content-checks {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.oma-content-check {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
}

/* The box renders inside BaseCheckbox, so it needs :deep() anchored at the
   root label. Same square box as the label-fields tables elsewhere in Settings. */
.oma-content-check :deep(.oma-content-check-box) {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background: rgba(16, 19, 29, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.oma-content-check :deep(.oma-content-check-input:checked + .oma-content-check-box) {
  background: #c8ff00;
}

.oma-content-check :deep(.oma-content-check-input:disabled + .oma-content-check-box) {
  opacity: 0.6;
}

.oma-content-check :deep(.oma-content-check-input:focus-visible + .oma-content-check-box) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.oma-content-check-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.oma-content-check-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink);
}

.oma-content-check-desc {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.6);
}
</style>
