<template>
  <MapNoticeBanner v-if="warning" class="online-quota-notice" :message="warning" />
</template>

<script setup lang="ts">
/**
 * Warns over the AIR map when the online ADS-B feed's daily quota is running
 * low, and when it is spent — the point at which the map stops updating and
 * would otherwise look like a quiet sky.
 *
 * Online only (`useOnlineQuota` polls nothing off grid), so it never competes
 * with `AdsbSourceNotice`, which only speaks off grid.
 */
import { computed } from 'vue'
import MapNoticeBanner from '@sentinel/ui/overlays/MapNoticeBanner.vue'
import { useOnlineQuota } from './composables/useOnlineQuota'
import { onlineQuotaWarning } from './services/onlineQuotaApi'

const { quota } = useOnlineQuota()
const warning = computed(() => onlineQuotaWarning(quota.value))
</script>
