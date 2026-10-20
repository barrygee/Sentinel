<template>
  <MapPausedOverlay
    v-if="pause"
    class="online-quota-paused"
    :headline="pause.headline"
    :detail="pause.detail ?? undefined"
  />
  <MapNoticeBanner v-else-if="warning" class="online-quota-notice" :message="warning" />
</template>

<script setup lang="ts">
/**
 * Says over the AIR map when the online ADS-B feed's daily call limit is
 * running low (a warning banner), and dims the map once it is reached — the
 * point at which aircraft stop updating and the map would otherwise look like
 * a quiet sky. One component for both, so the figure is polled once.
 *
 * Online only (`useOnlineQuota` polls nothing off grid), so it never competes
 * with `AdsbSourceNotice`, which only speaks off grid.
 */
import { computed } from 'vue'
import MapNoticeBanner from '@sentinel/ui/overlays/MapNoticeBanner.vue'
import MapPausedOverlay from '@sentinel/ui/overlays/MapPausedOverlay.vue'
import { useOnlineQuota } from './composables/useOnlineQuota'
import { onlineQuotaPause, onlineQuotaWarning } from './services/onlineQuotaApi'

const { quota } = useOnlineQuota()
const pause = computed(() => onlineQuotaPause(quota.value))
const warning = computed(() => onlineQuotaWarning(quota.value))
</script>
