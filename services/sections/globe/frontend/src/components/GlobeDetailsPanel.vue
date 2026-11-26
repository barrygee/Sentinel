<script setup lang="ts">
/**
 * The selected object's details: what it is, a short identity line, and its
 * position and other data as label/value grids. A floating panel on the
 * right on wide screens, a bottom sheet under 900px. Escape or × closes it;
 * the centre button flies the globe to the object.
 */
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import CentreOnMapIcon from '@sentinel/ui/icons/CentreOnMapIcon.vue'
import CloseIcon from '@sentinel/ui/icons/CloseIcon.vue'
import type { ObjectDetails } from '../feeds/objectDetails'

defineProps<{
  details: ObjectDetails
}>()

const emit = defineEmits<{
  /** The viewer closed the panel (clears the selection). */
  close: []
  /** The viewer asked to centre the globe on the object. */
  centre: []
}>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}
</script>

<template>
  <section class="globe-details" aria-labelledby="globe-details-title" @keydown="onKeydown">
    <header class="globe-details-header">
      <p class="globe-details-kind">
        <span class="globe-details-swatch" :style="{ background: details.colour }" />
        {{ details.kindLabel }}
      </p>
      <h2 id="globe-details-title" class="globe-details-title">{{ details.title }}</h2>
      <p v-if="details.subtitle" class="globe-details-subtitle">{{ details.subtitle }}</p>
      <div class="globe-details-actions">
        <BaseIconAction
          variant="accessory"
          accessible-name="Centre the globe on it"
          @click="emit('centre')"
        >
          <CentreOnMapIcon />
        </BaseIconAction>
        <BaseIconAction variant="accessory" accessible-name="Close details" @click="emit('close')">
          <CloseIcon :size="12" />
        </BaseIconAction>
      </div>
    </header>
    <div class="globe-details-body">
      <BaseDataGrid
        v-for="section in details.sections"
        :key="section.title"
        :title="section.title"
        :columns="2"
      >
        <BaseDataCell
          v-for="cell in section.cells"
          :key="cell.label"
          :label="cell.label"
          :value="cell.value"
          :wide="section.cells.length === 1"
        />
      </BaseDataGrid>
    </div>
  </section>
</template>

<style scoped>
/* A bottom sheet on phones and small tablets; a floating panel from 900px. */
.globe-details {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 45%;
  display: flex;
  flex-direction: column;
  background: #0d0f14;
  color: var(--ink, #fff);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  --ba-grid-section-padding-x: 18px;
}

.globe-details-header {
  position: relative;
  padding: 16px 96px 6px 18px;
}

.globe-details-kind {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.62);
}

.globe-details-swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.globe-details-title {
  margin: 6px 0 0;
  font:
    500 20px/1.15 'Barlow Condensed',
    'Barlow',
    sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.globe-details-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.globe-details-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 4px;
}

.globe-details-body {
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (min-width: 900px) {
  .globe-details {
    left: auto;
    top: 12px;
    right: 12px;
    bottom: auto;
    width: 300px;
    max-height: calc(100% - 96px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 2px;
  }
}
</style>
