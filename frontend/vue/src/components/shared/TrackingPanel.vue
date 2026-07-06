<template>
  <BaseList :is-empty="store.count === 0" empty-text="No tracked items">
    <template #empty>
      <div id="msb-tracking-empty">No tracked items</div>
    </template>
    <div
      v-for="item in store.allItems"
      :key="item.id"
      class="tracking-card"
      :class="{ 'tracking-card-readonly': !store.isLive(item.id) }"
      :data-tracking-id="item.id"
    >
      <div class="tracking-card-header">
        <div class="tracking-card-title">
          <span class="tracking-card-domain">{{ item.domain.toUpperCase() }}</span>
          <span class="tracking-card-name">{{ item.name }}</span>
        </div>
        <button
          class="tracking-card-close"
          aria-label="Untrack"
          @click="store.untrackItem(item.id)"
        >
          &#x2715;
        </button>
      </div>

      <template v-for="section in sectionsFor(item.fields)" :key="section.title">
        <BaseDataGrid v-if="section.cells.length" :title="section.title" :columns="3">
          <BaseDataCell
            v-for="cell in section.cells"
            :key="cell.label"
            :label="cell.label"
            :value="cell.value"
            :wide="cell.label === 'CATEGORY'"
            :emphasis="!!cell.emrg"
          />
        </BaseDataGrid>
      </template>
    </div>
  </BaseList>
</template>

<script setup lang="ts">
import { useTrackingStore, type TrackingField } from '@/stores/tracking'
import BaseList from '@/components/base/BaseList.vue'
import BaseDataGrid from '@/components/base/BaseDataGrid.vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'

const store = useTrackingStore()

const FLIGHT_LABELS = ['ALT', 'GS', 'HDG', 'SQUAWK']
const AIRCRAFT_LABELS = ['REG', 'TYPE', 'CATEGORY', 'EMRG', 'CLASS']

interface Section {
  title: string
  cells: TrackingField[]
}

function sectionsFor(fields: TrackingField[]): Section[] {
  const byLabel = new Map<string, TrackingField>()
  for (const f of fields) byLabel.set(f.label, f)

  const flight: TrackingField[] = []
  for (const label of FLIGHT_LABELS) {
    const f = byLabel.get(label)
    if (f) {
      flight.push(f)
      byLabel.delete(label)
    }
  }

  const aircraft: TrackingField[] = []
  for (const label of AIRCRAFT_LABELS) {
    const f = byLabel.get(label)
    if (f) {
      aircraft.push(f)
      byLabel.delete(label)
    }
  }
  // Append any remaining fields (other domains, future fields) to AIRCRAFT_DATA
  byLabel.forEach((f) => aircraft.push(f))

  return [
    { title: 'FLIGHT DATA', cells: flight },
    { title: 'AIRCRAFT DATA', cells: aircraft },
  ]
}
</script>

<style>
.tracking-card {
  width: 100%;
  color: #fff;
  font-family: var(--font-primary);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  user-select: none;
  box-sizing: border-box;
}

.tracking-card + .tracking-card {
  margin-top: 24px;
}

.tracking-card-readonly {
  opacity: 1;
}

.tracking-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 24px 12px 24px;
  gap: 12px;
}

.tracking-card-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.tracking-card-domain {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--color-accent, #c8ff00);
  text-transform: uppercase;
  line-height: 1;
}

.tracking-card-name {
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #fff;
  line-height: 1.2;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tracking-card-close {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: rgba(255, 255, 255, 0.35);
  font-family: var(--font-primary);
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  transition: color 0.2s;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: -1px;
}

.tracking-card-close:hover {
  color: rgba(255, 255, 255, 0.85);
}

.tracking-card-close::after {
  content: 'UNTRACK';
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: rgba(255, 255, 255, 0.7);
  font-family: var(--font-condensed, 'Barlow Condensed', 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 4px 7px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}

.tracking-card-close:hover::after {
  opacity: 1;
}

/* Per-site deltas for the BaseDataGrid/BaseDataCell primitives rendered above:
   tighter spacing, a lighter value weight, and free-text wrapping (tracked
   fields can be long, e.g. aircraft type strings) instead of SpaceFilter's
   fixed-width truncated telemetry. Custom properties inherit through the DOM
   regardless of the component boundary, so this plain descendant rule reaches
   BaseDataGrid/BaseDataCell's own scoped styles without needing :deep(). */
.tracking-card {
  --ba-grid-section-gap: 6px;
  --ba-grid-section-padding-top: 18px;
  --ba-grid-section-padding-bottom: 8px;
  --ba-grid-column-gap: 10px;
  --ba-grid-row-gap: 14px;
  --ba-cell-gap: 2px;
  --ba-cell-label-color: rgba(255, 255, 255, 0.55);
  --ba-cell-value-font-size: 13px;
  --ba-cell-value-font-weight: 400;
  --ba-cell-value-white-space: normal;
  --ba-cell-value-overflow: visible;
  --ba-cell-value-text-overflow: clip;
  --ba-cell-value-word-break: normal;
  --ba-cell-value-overflow-wrap: break-word;
  --ba-cell-value-line-height: 1.25;
}

.tracking-card .tracking-card-name {
  color: #ffffff;
}

#tracking-toggle-btn {
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #fff;
  opacity: 0.6;
  transition:
    background 0.2s,
    opacity 0.2s,
    color 0.2s;
  flex-shrink: 0;
  margin: 4px 0;
}

#tracking-toggle-btn:hover {
  background: var(--color-border);
  border-radius: 6px;
  opacity: 1;
}

#tracking-toggle-btn.tracking-btn-active {
  opacity: 1;
  color: var(--color-accent);
}

#tracking-icon {
  display: block;
  flex-shrink: 0;
  width: auto;
  height: 15px;
}

#tracking-count {
  font-family: var(--font-primary);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1;
  margin-bottom: 4px;
}

#tracking-count.tracking-count-active {
  color: var(--color-accent);
}
</style>
