<template>
  <MapDimOverlay v-if="limitReached" class="online-quota-dim" />
  <MapNoticeBanner
    v-if="visibleNotice"
    class="online-quota-notice"
    :message="visibleNotice.warning"
    dismissible
    @dismiss="dismiss(visibleNotice.key)"
  />
</template>

<script setup lang="ts">
/**
 * Warns over the AIR map when the online ADS-B feed's daily call limit is
 * running low, and once it is reached also dims the map — the point at which
 * aircraft stop updating and the map would otherwise look like a quiet sky.
 * One component for both, so the figure is polled once.
 *
 * The warning can be closed with its ×; it stays closed until it gets worse or
 * the day's count starts again (`onlineQuotaDismissal`). The dim stays: it is
 * what explains an empty sky, not a message to read once.
 *
 * Online only (`useOnlineQuota` polls nothing off grid), so it never competes
 * with `AdsbSourceNotice`, which only speaks off grid.
 */
import { computed, ref } from 'vue'
import MapDimOverlay from '@sentinel/ui/overlays/MapDimOverlay.vue'
import MapNoticeBanner from '@sentinel/ui/overlays/MapNoticeBanner.vue'
import { useOnlineQuota } from './composables/useOnlineQuota'
import { onlineQuotaWarning } from './services/onlineQuotaApi'
import {
  quotaNoticeKey,
  readDismissedQuotaNotice,
  saveDismissedQuotaNotice,
} from './services/onlineQuotaDismissal'

const { quota } = useOnlineQuota()
const limitReached = computed(() => quota.value?.state === 'reached')
const dismissedKey = ref<string | null>(readDismissedQuotaNotice())

// Recomputed on every poll (each reply is a new object), which is also what
// notices the UTC day rolling over while the page stays open.
const visibleNotice = computed(() => {
  const quotaFigure = quota.value
  if (!quotaFigure) return null
  const warning = onlineQuotaWarning(quotaFigure)
  if (!warning) return null
  const key = quotaNoticeKey(quotaFigure, Date.now())
  return key === dismissedKey.value ? null : { warning, key }
})

/** Close the warning shown under `key` until there is something new to say. */
function dismiss(key: string): void {
  dismissedKey.value = key
  saveDismissedQuotaNotice(key)
}
</script>
