<template>
  <BaseFilterPanel
    :items="items"
    :query="seaStore.searchQuery"
    :expanded-key="expandedKey"
    id-prefix="sea-filter"
    :input-label="
      portsOn
        ? 'Filter vessels and ports by name, MMSI, type, destination or LOCODE'
        : 'Filter vessels by name, MMSI, type or destination'
    "
    :placeholder="
      portsOn ? 'NAME · MMSI · TYPE · DESTINATION · PORT' : 'NAME · MMSI · TYPE · DESTINATION'
    "
    :listbox-label="portsOn ? 'Live vessels and ports' : 'Live vessels'"
    :empty-message="emptyMessage"
    @update:query="seaStore.setSearchQuery"
    @update:expanded-key="onExpand"
  >
    <template #accordion="{ item }">
      <div class="sea-filter-accordion">
        <SeaPortDetails
          v-if="portFor(item.key)"
          :port="portFor(item.key)!.properties"
          :coordinates="portFor(item.key)!.geometry.coordinates as [number, number]"
          :sdr-connected="sdrStore.connected"
          :tune-notice="tuneNotice === item.key"
          @tune="tunePortChannel(portFor(item.key)!.properties, $event)"
        />
        <template v-else-if="vesselFor(item.key)">
          <SeaVesselDetails :vessel="vesselFor(item.key)!" />
          <!-- Same affordance as the AIR aircraft row: an icon action rather
               than a labelled button, so the row stays a data view. -->
          <div class="sea-acc-action-row">
            <BaseIconAction
              class="sea-acc-btn"
              :active="seaStore.selectedMmsi === item.key"
              active-class="sea-acc-btn--active"
              accessible-name="Centre on map"
              tooltip="Centre on map"
              @click.stop="emit('locate', item.key)"
            >
              <CentreOnMapIcon />
            </BaseIconAction>
          </div>
        </template>
      </div>
    </template>
  </BaseFilterPanel>
</template>

<script setup lang="ts">
/**
 * Sea FILTER pane — the searchable list of live AIS vessels and, while the
 * ports overlay is on, of the known ports with their VHF channels.
 *
 * Mirrors the Land pane's shape (shared BaseFilterPanel shell, an expandable
 * per-item accordion of BaseDataGrid sections) over AIS data. The list tracks
 * the map exactly: it renders the same polled snapshot the map plots, under the
 * same FILTER rail category, so a vessel that drops out of the retention window
 * leaves both at once. This list is also the map's accessible equivalent —
 * for the plotted ports too, whose markers are otherwise opaque to AT.
 */
import { computed, ref, watch } from 'vue'
import BaseFilterPanel, {
  type FilterPanelItem,
} from '@/components/shared/filter/BaseFilterPanel.vue'
import SeaVesselDetails from './SeaVesselDetails.vue'
import BaseIconAction from '@/components/base/BaseIconAction.vue'
import CentreOnMapIcon from '@/components/shared/CentreOnMapIcon.vue'
import SeaPortDetails from './SeaPortDetails.vue'
import { useSeaStore, type SeaVessel } from '@/stores/sea'
import { useSdrStore } from '@/stores/sdr'
import { useNotificationsStore } from '@/stores/notifications'
import { familyMatchesCategory, vesselFamilyLabel } from '@/utils/aisShipType'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import {
  findPort,
  PORTS_DATA,
  type PortChannel,
  type PortProperties,
} from './controls/ports/portsData'
import { formatMarineVhfMhz, marineVhfChannelHz, MARINE_VHF_MODE } from '@/utils/marineVhf'

const emit = defineEmits<{ locate: [mmsi: string] }>()
const seaStore = useSeaStore()
const sdrStore = useSdrStore()
const notificationsStore = useNotificationsStore()

/** Whether the ports overlay is on — the ports are listed exactly when they
 *  are plotted, independent of the vessel FILTER category. */
const portsOn = computed(() => seaStore.overlayStates.ports)

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

/** Ports matching the search text, in the seed's (regional) order; none
 *  while the overlay is off. */
const matchingPorts = computed(() => {
  if (!portsOn.value) return []
  const needle = seaStore.searchQuery.trim().toLowerCase()
  return PORTS_DATA.features.filter((feature) => {
    if (!needle) return true
    const { locode, name } = feature.properties
    return `${name} ${locode}`.toLowerCase().includes(needle)
  })
})

const vesselItems = computed<FilterPanelItem[]>(() =>
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

const portItems = computed<FilterPanelItem[]>(() =>
  matchingPorts.value.map((feature) => {
    const { locode, name } = feature.properties
    return {
      key: locode,
      primary: name.toUpperCase(),
      secondary: locode,
      optionLabel: `${name}, port, ${locode}`,
    }
  }),
)

// Live vessels first, the fixed ports after them.
const items = computed<FilterPanelItem[]>(() => [...vesselItems.value, ...portItems.value])

// One row is open at a time, vessel or port; opening one clears the other.
const expandedKey = computed(() =>
  portsOn.value && seaStore.searchExpandedPort
    ? seaStore.searchExpandedPort
    : seaStore.searchExpandedMmsi,
)

const emptyMessage = computed(() => {
  // With the ports on, an empty list can only mean the search missed.
  if (portsOn.value) return 'No vessels or ports match'
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

function portFor(locode: string) {
  return findPort(locode)
}

function onExpand(key: string): void {
  if (portFor(key)) {
    seaStore.setSearchExpandedPort(key)
    seaStore.setSearchExpandedMmsi('')
  } else {
    seaStore.setSearchExpandedMmsi(key)
    seaStore.setSearchExpandedPort('')
  }
}

// ── tuning a port channel ──────────────────────────────────────────────────
// Which port row is showing the "connect an SDR" hint (by LOCODE).
const tuneNotice = ref<string | null>(null)

/** Tune the SDR to a port's channel, the way the Air pane tunes an airport. */
function tunePortChannel(port: PortProperties, portChannel: PortChannel): void {
  if (!sdrStore.connected) {
    tuneNotice.value = port.locode
    return
  }
  tuneNotice.value = null
  const hz = marineVhfChannelHz(portChannel.channel)
  // SeaPortDetails only offers channels the plan knows, so hz is never null.
  /* v8 ignore start -- defensive: unreachable via the rendered buttons */
  if (hz === null) return
  /* v8 ignore stop */
  const display = `CH ${portChannel.channel} ${formatMarineVhfMhz(portChannel.channel)}`
  document.dispatchEvent(
    new CustomEvent('sentinel:sdr-tune-external', {
      detail: { hz, mode: MARINE_VHF_MODE, satName: `${port.name} ${portChannel.label}` },
    }),
  )
  notificationsStore.add({
    type: 'system',
    title: `${port.locode} ${portChannel.label.toUpperCase()}`,
    detail: `Tuned ${display} ${MARINE_VHF_MODE}`,
  })
}

// A port clicked on the map expands its row here. The sidebar tab switch is
// App.vue's job, as for vessels.
useDocumentEvent('sea-open-port', (event: Event) => {
  const { locode } = (event as CustomEvent<{ locode: string }>).detail
  onExpand(locode)
})

// A vessel clicked on the map expands here. The sidebar tab switch is App.vue's
// job (it owns the sidebar); this side only has to open the right row.
useDocumentEvent('sea-open-vessel', (event: Event) => {
  const { mmsi } = (event as CustomEvent<{ mmsi: string }>).detail
  onExpand(mmsi)
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

/* Mirrors the AIR aircraft accordion's action row (.acft-acc-action-row /
   .acft-acc-btn) so the same action reads the same in both panes. */
.sea-acc-action-row {
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 24px 0;
}

/* 36px square control, matching the aircraft and satellite accordions. */
.sea-acc-btn {
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  background: #0d1015;
  border: none;
}
</style>
