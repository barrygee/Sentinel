<template>
  <div class="online-quota-usage">
    <BaseDataGrid :columns="4">
      <BaseDataCell label="DAILY LIMIT" :value="limitText" />
      <BaseDataCell label="CALLS USED TODAY" :value="usedText" />
      <BaseDataCell
        label="REMAINING"
        :value="remainingText"
        :emphasis="quota?.state === 'reached'"
      />
      <BaseDataCell v-if="hasLimit" :label="resetLabel" :value="resetText" />
    </BaseDataGrid>
    <BaseWarningNotice v-if="warning" :message="warning" />
  </div>
</template>

<script setup lang="ts">
/**
 * Settings › AIR row showing how many calls Sentinel has made to the online
 * ADS-B feed in use today (UTC, the day adsb.lol counts), against that feed's daily limit,
 * so the limit is easy to see coming before the map stops updating.
 * Read-only: it edits nothing, so it emits nothing to the panel.
 *
 * Counted per feed: choosing another Online Data Source shows that feed's own
 * count. The row sits directly under that setting, so it doesn't repeat the
 * feed's address. A feed with no known daily limit still shows its calls, with no
 * remaining figure and no warning.
 *
 * Shown only in online mode (its `sourceMode`); `useOnlineQuota` keeps it
 * current while the panel is open.
 */
import { computed } from 'vue'
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'
import { useOnlineQuota } from '../composables/useOnlineQuota'
import {
  formatQuotaDuration,
  onlineQuotaWarning,
  type OnlineQuotaLimitSource,
} from '../services/onlineQuotaApi'

/** Says where the limit came from, so an overridden or assumed figure isn't mistaken for the feed's. */
const LIMIT_SOURCE_LABEL: Record<OnlineQuotaLimitSource, string> = {
  setting: 'from Daily Call Limit',
  feed: 'stated by the feed',
  default: 'built-in default',
}

const { quota } = useOnlineQuota()

const hasLimit = computed(() => quota.value?.limit != null)
const limitText = computed(() => {
  const current = quota.value
  if (!current) return '—'
  if (current.limit === null || current.limitSource === null) return 'None stated'
  return `${current.limit} (${LIMIT_SOURCE_LABEL[current.limitSource]})`
})
const usedText = computed(() => {
  const current = quota.value
  if (!current) return '—'
  return current.limit === null ? String(current.used) : `${current.used} / ${current.limit}`
})
const remainingText = computed(() =>
  quota.value?.remaining != null ? String(quota.value.remaining) : '—',
)
// Reached: when calls resume. Otherwise: when the count starts again at the
// next 00:00 UTC.
const resetLabel = computed(() => (quota.value?.state === 'reached' ? 'RESUMES IN' : 'RESETS IN'))
const resetText = computed(() =>
  quota.value?.resetsInSeconds != null ? formatQuotaDuration(quota.value.resetsInSeconds) : '—',
)
const warning = computed(() => onlineQuotaWarning(quota.value))
</script>

<style scoped>
/* BaseDataGrid/BaseDataCell default to the dark map panels they were extracted
   from. Re-pointed at the settings panel exactly as SDR's SentryHostDetails
   does, so labelled figures read the same in every settings row: caption-size
   labels, plain value-size figures, the same greys, gaps and padding (none at
   the sides, so the figures line up with the row's title). */
.online-quota-usage {
  --ba-grid-section-padding-x: 0px;
  --ba-grid-section-padding-top: 0px;
  --ba-grid-section-padding-bottom: 0px;
  --ba-grid-row-gap: 20px;
  --ba-grid-column-gap: 24px;
  --ba-cell-gap: 7px;
  --ba-cell-label-font-size: var(--settings-text-caption);
  --ba-cell-label-font-weight: 600;
  --ba-cell-label-letter-spacing: 0.14em;
  --ba-cell-label-color: rgba(16, 19, 29, 0.62);
  --ba-cell-value-font-size: var(--settings-text-value);
  --ba-cell-value-font-weight: 400;
  --ba-cell-value-letter-spacing: 0.02em;
  --ba-cell-value-color: rgba(16, 19, 29, 0.92);
  --ba-cell-value-emphasis-color: #d94436;
  /* Short figures: each column as wide as its content rather than four equal
     columns stretched across the row. */
  --ba-grid-four-columns: repeat(4, max-content);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 0 20px;
}
</style>
