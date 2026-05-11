<template>
  <div id="msb-pane-tracking-inner">
    <div v-if="store.count === 0" id="msb-tracking-empty">No tracked items</div>
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
        <button class="tracking-card-close" aria-label="Untrack" @click="store.untrackItem(item.id)">&#x2715;</button>
      </div>

      <template v-for="section in sectionsFor(item.fields)" :key="section.title">
        <div v-if="section.cells.length" class="sfr-acc-section">
          <div class="sfr-acc-section-title">{{ section.title }}</div>
          <div class="sfr-acc-grid sfr-acc-grid--three">
            <div
              v-for="cell in section.cells"
              :key="cell.label"
              class="sfr-acc-cell"
            >
              <div class="sfr-acc-cell-label">{{ cell.label }}</div>
              <div class="sfr-acc-cell-value" :class="{ 'sfr-acc-cell-value--emrg': cell.emrg }">{{ cell.value }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTrackingStore, type TrackingField } from '@/stores/tracking'

const store = useTrackingStore()

const FLIGHT_LABELS = ['ALT', 'GS', 'HDG', 'SQUAWK']
const AIRCRAFT_LABELS = ['REG', 'TYPE', 'CATEGORY', 'EMRG', 'CLASS']

interface Section { title: string; cells: TrackingField[] }

function sectionsFor(fields: TrackingField[]): Section[] {
  const byLabel = new Map<string, TrackingField>()
  for (const f of fields) byLabel.set(f.label, f)

  const flight: TrackingField[] = []
  for (const label of FLIGHT_LABELS) {
    const f = byLabel.get(label)
    if (f) { flight.push(f); byLabel.delete(label) }
  }

  const aircraft: TrackingField[] = []
  for (const label of AIRCRAFT_LABELS) {
    const f = byLabel.get(label)
    if (f) { aircraft.push(f); byLabel.delete(label) }
  }
  // Append any remaining fields (other domains, future fields) to AIRCRAFT_DATA
  byLabel.forEach(f => aircraft.push(f))

  return [
    { title: 'FLIGHT DATA',   cells: flight },
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
    opacity: 0.7;
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
    margin-top: 4px;
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

.tracking-card .sfr-acc-cell-value {
    font-size: 13px;
    color: #ffffff;
    font-weight: 400;
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    word-break: break-word;
    line-height: 1.25;
}

.tracking-card .tracking-card-name {
    color: #ffffff;
}

.tracking-card .sfr-acc-cell-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.55);
}

.tracking-card .sfr-acc-section {
    gap: 6px;
    padding-top: 10px;
    padding-bottom: 8px;
}

.tracking-card .sfr-acc-grid {
    column-gap: 10px;
    row-gap: 6px;
}

.tracking-card .sfr-acc-cell {
    gap: 2px;
}

.sfr-acc-cell-value--emrg {
    color: #ff4040;
    font-weight: 700;
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
    transition: background 0.2s, opacity 0.2s, color 0.2s;
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
