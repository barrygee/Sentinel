<template>
  <MapDimOverlay v-if="limitReached" class="online-quota-dim" />
  <MapNoticeBanner v-if="warning" class="online-quota-notice" :message="warning" />
</template>

<script setup lang="ts">
/**
 * Warns over the AIR map when the online ADS-B feed's daily call limit is
 * running low, and once it is reached also dims the map — the point at which
 * aircraft stop updating and the map would otherwise look like a quiet sky.
 * One component for both, so the figure is polled once.
 *
 * Online only (`useOnlineQuota` polls nothing off grid), so it never competes
 * with `AdsbSourceNotice`, which only speaks off grid.
 */
import { computed } from 'vue'
import MapDimOverlay from '@sentinel/ui/overlays/MapDimOverlay.vue'
import MapNoticeBanner from '@sentinel/ui/overlays/MapNoticeBanner.vue'
import { useOnlineQuota } from './composables/useOnlineQuota'
import { onlineQuotaWarning } from './services/onlineQuotaApi'

const { quota } = useOnlineQuota()
const limitReached = computed(() => quota.value?.state === 'reached')
const warning = computed(() => onlineQuotaWarning(quota.value))
</script>
