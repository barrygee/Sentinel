<template>
  <div class="acft-acc-action-section">
    <BaseIconActionRow>
      <BaseIconAction
        variant="accessory"
        :active="tracking"
        :accessible-name="trackLabel"
        :tooltip="trackLabel"
        @click.stop="emit('track')"
      >
        <LocationPinIcon />
      </BaseIconAction>
      <BaseIconAction
        variant="accessory"
        :active="alertsOn"
        :accessible-name="alertsLabel"
        :tooltip="alertsLabel"
        @click.stop="emit('toggleAlerts')"
      >
        <!-- Strike-through shown when alerts for this aircraft are off. -->
        <BellIcon :size="14" :struck="!alertsOn" />
      </BaseIconAction>
      <BaseIconAction
        variant="accessory"
        accessible-name="Centre on map"
        tooltip="Centre on map"
        @click.stop="emit('centre')"
      >
        <CentreOnMapIcon />
      </BaseIconAction>
    </BaseIconActionRow>
  </div>
</template>

<script setup lang="ts">
/**
 * The track / alerts / centre buttons at the foot of an expanded aircraft row.
 * Purely presentational: the pane owns the state and handles the events.
 */
import { computed } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import BaseIconActionRow from '@sentinel/ui/base/BaseIconActionRow.vue'
import LocationPinIcon from '@sentinel/ui/icons/LocationPinIcon.vue'
import CentreOnMapIcon from '@sentinel/ui/icons/CentreOnMapIcon.vue'
import BellIcon from '@sentinel/ui/icons/BellIcon.vue'

const props = defineProps<{
  /** The map is following this aircraft. */
  tracking: boolean
  /** Alerts are on for this aircraft. */
  alertsOn: boolean
}>()

const emit = defineEmits<{ track: []; toggleAlerts: []; centre: [] }>()

const trackLabel = computed(() => (props.tracking ? 'Untrack aircraft' : 'Track aircraft'))
const alertsLabel = computed(() => (props.alertsOn ? 'Disable alerts' : 'Enable alerts'))
</script>

<style scoped>
.acft-acc-action-section {
  /* 16px on the left, not the data grids' 24px, so the button boxes line up
     with the grid text above. */
  padding: 8px 24px 0 16px;
}
</style>
