<template>
  <div class="sdr-device-item" :class="{ 'sdr-device-item--open': open }">
    <div class="sdr-device-row">
      <span class="sdr-device-info" :style="confirming ? 'opacity:0.4' : ''">
        <SdrSourceStatusDot :connected="statusConnected" />
        {{ feed.name }}
        <span class="land-feed-row-chip">{{ CATEGORY_LABEL[feed.category] }}</span>
        <span class="land-feed-row-provider">{{ PROVIDER_LABEL[feed.provider] }}</span>
      </span>
      <button
        v-if="!confirming"
        class="sdr-device-btn"
        title="Edit"
        aria-label="Edit feed"
        @click="emit('toggle-edit')"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path
            d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        v-if="!confirming"
        class="sdr-device-btn sdr-device-btn--danger"
        title="Delete"
        aria-label="Delete feed"
        @click="emit('start-delete')"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <line
            x1="2.5"
            y1="2.5"
            x2="10.5"
            y2="10.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <line
            x1="10.5"
            y1="2.5"
            x2="2.5"
            y2="10.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <div v-if="confirming" class="sdr-device-confirm" style="display: flex">
        <span class="sdr-device-confirm-label">DELETE?</span>
        <button
          class="sdr-device-confirm-btn sdr-device-confirm-btn--yes"
          @click="emit('confirm-delete')"
        >
          YES
        </button>
        <button class="sdr-device-confirm-btn" @click="emit('cancel-delete')">NO</button>
      </div>
    </div>
    <LandFeedForm
      v-if="open"
      :feed="feed"
      @save="(updated, credentialOp) => emit('save', updated, credentialOp)"
      @cancel="emit('cancel-edit')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * `LandFeedRow` — one configured feed's row in `LandFeedsControl`, cloned
 * from `SdrRadioRow`'s shape (status dot, edit/delete with inline confirm,
 * the editor accordion underneath).
 */
import SdrSourceStatusDot from './SdrSourceStatusDot.vue'
import LandFeedForm from './LandFeedForm.vue'
import { computed } from 'vue'
import type { FeedCategory, FeedConfig, FeedProvider } from '@/types/landFeeds'

const CATEGORY_LABEL: Record<FeedCategory, string> = {
  'traffic-cameras': 'TRAFFIC CAMERAS',
  'traffic-data': 'TRAFFIC DATA',
  webcams: 'WEBCAMS',
}
const PROVIDER_LABEL: Record<FeedProvider, string> = {
  durham: 'Durham CC',
  'tfl-jamcams': 'TfL JamCams',
  snapshot: 'Snapshot',
}

const props = defineProps<{
  feed: FeedConfig
  /** Live runtime status for this feed, when known. */
  status?: { running: boolean; lastError: string | null } | null
  open: boolean
  confirming: boolean
}>()

/** Reachability dot: true once the feed is running with no last error, false
 *  once it has reported one, null (checking) until a status is known — or
 *  when the feed is simply switched off, which isn't a failure to report. */
const statusConnected = computed<boolean | null>(() => {
  if (!props.feed.enabled) return null
  if (!props.status) return null
  if (props.status.lastError) return false
  return props.status.running
})

const emit = defineEmits<{
  'toggle-edit': []
  'start-delete': []
  'confirm-delete': []
  'cancel-delete': []
  save: [feed: FeedConfig, credentialOp: (() => Promise<unknown>) | undefined]
  'cancel-edit': []
}>()
</script>

<style scoped>
.land-feed-row-chip {
  margin-left: 8px;
  padding: 1px 6px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(16, 19, 29, 0.55);
  background: rgba(16, 19, 29, 0.08);
}
.land-feed-row-provider {
  margin-left: 6px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  color: rgba(16, 19, 29, 0.5);
}
</style>
