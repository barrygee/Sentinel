<template>
  <BaseFilterPanel
    :items="items"
    :query="seaStore.searchQuery"
    :expanded-key="seaStore.searchExpandedMmsi"
    id-prefix="sea-filter"
    input-label="Filter vessels by name, MMSI, type or destination"
    placeholder="NAME · MMSI · TYPE · DESTINATION"
    listbox-label="Live vessels"
    :empty-message="emptyMessage"
    @update:query="seaStore.setSearchQuery"
    @update:expanded-key="onExpand"
  >
    <template #accordion="{ item }">
      <div class="sea-filter-accordion">
        <template v-if="vesselFor(item.key)">
          <SeaVesselDetails :vessel="vesselFor(item.key)!" />
          <div class="sea-filter-actions">
            <BaseButton
              variant="ghost"
              bordered
              :active="seaStore.selectedMmsi === item.key"
              :aria-pressed="seaStore.selectedMmsi === item.key"
              @click.stop="emit('locate', item.key)"
            >
              {{ seaStore.selectedMmsi === item.key ? 'SELECTED' : 'SHOW ON MAP' }}
            </BaseButton>
          </div>
        </template>
      </div>
    </template>
  </BaseFilterPanel>
</template>

<script setup lang="ts">
/**
 * Sea FILTER pane — the searchable list of live AIS vessels.
 *
 * Mirrors the Land pane's shape (shared BaseFilterPanel shell, an expandable
 * per-item accordion of BaseDataGrid sections) over AIS data. The list tracks
 * the map exactly: it renders the same polled snapshot the map plots, under the
 * same FILTER rail category, so a vessel that drops out of the retention window
 * leaves both at once. This list is also the map's accessible equivalent.
 */
import { computed, watch } from 'vue'
import BaseFilterPanel, {
  type FilterPanelItem,
} from '@/components/shared/filter/BaseFilterPanel.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import SeaVesselDetails from './SeaVesselDetails.vue'
import { useSeaStore, type SeaVessel } from '@/stores/sea'
import { familyMatchesCategory, vesselFamilyLabel } from '@/utils/aisShipType'
import { useDocumentEvent } from '@/composables/useDocumentEvent'

const seaStore = useSeaStore()
const emit = defineEmits<{ locate: [mmsi: string] }>()

/** Vessels under the rail category that match the search text. */
const matchingVessels = computed<SeaVessel[]>(() => {
  if (!seaStore.overlayStates.vessels) return []
  const category = seaStore.seaFilterCategory
  const needle = seaStore.searchQuery.trim().toLowerCase()
  return seaStore.vessels.filter((vessel) => {
    if (!familyMatchesCategory(vessel.family, category)) return false
    if (!needle) return true
    return [vessel.name, vessel.mmsi, vessel.typeLabel, vessel.destination, vessel.callsign]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })
})

const items = computed<FilterPanelItem[]>(() =>
  matchingVessels.value.map((vessel) => {
    const typeText = vessel.typeLabel || vesselFamilyLabel(vessel.family)
    return {
      key: vessel.mmsi,
      primary: vessel.name,
      secondary: `${typeText} · ${vessel.mmsi}`,
      optionLabel: `${vessel.name}, ${typeText}, MMSI ${vessel.mmsi}`,
    }
  }),
)

const emptyMessage = computed(() => {
  if (!seaStore.overlayStates.vessels) return 'Vessels layer hidden'
  if (seaStore.vessels.length === 0) {
    const { status, error } = seaStore.feed
    if (status === 'live' || status === 'connecting') return 'No vessels in view'
    return error ? `No vessels — ${error}` : 'No vessels received'
  }
  return 'No vessels match'
})

function vesselFor(mmsi: string): SeaVessel | undefined {
  return seaStore.vessels.find((vessel) => vessel.mmsi === mmsi)
}

function onExpand(mmsi: string): void {
  seaStore.setSearchExpandedMmsi(mmsi)
}

// A vessel clicked on the map expands here. The sidebar tab switch is App.vue's
// job (it owns the sidebar); this side only has to open the right row.
useDocumentEvent('sea-open-vessel', (event: Event) => {
  const { mmsi } = (event as CustomEvent<{ mmsi: string }>).detail
  seaStore.setSearchExpandedMmsi(mmsi)
})

// Collapse the accordion if its vessel leaves the snapshot (aged out, or now
// outside the viewport), so the pane never holds an expanded row for a vessel
// that is no longer on the map.
watch(
  () => seaStore.vessels,
  (vessels) => {
    const expanded = seaStore.searchExpandedMmsi
    if (expanded && !vessels.some((vessel) => vessel.mmsi === expanded)) {
      seaStore.setSearchExpandedMmsi('')
    }
  },
)
</script>

<style scoped>
.sea-filter-accordion {
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}
.sea-filter-actions {
  display: flex;
  justify-content: flex-end;
  padding: 8px 24px 0;
}
</style>
