<template>
  <div class="sdr-devices-wrap">
    <div class="sdr-devices-list">
      <div v-if="draftFeeds.length === 0" class="sdr-devices-empty">
        No live feeds configured. Add one below — e.g. Durham County Council's traffic cameras or
        TfL JamCams.
      </div>
      <LandFeedRow
        v-for="feed in draftFeeds"
        :key="feed.id"
        :feed="feed"
        :status="statusById[feed.id]"
        :open="openId === feed.id"
        :confirming="confirmId === feed.id"
        @toggle-edit="toggleEdit(feed.id)"
        @start-delete="startDelete(feed.id)"
        @confirm-delete="confirmDelete(feed.id)"
        @cancel-delete="confirmId = null"
        @save="onFormSave"
        @cancel-edit="openId = null"
      />
      <div
        v-if="openId === 'new'"
        class="sdr-device-item sdr-device-item--open sdr-device-item--new"
      >
        <LandFeedForm :feed="null" @save="onFormSave" @cancel="openId = null" />
      </div>
    </div>
    <BaseButton variant="ghost" class="sdr-devices-add-btn" @click="toggleNew"
      >+ ADD FEED</BaseButton
    >
  </div>
</template>

<script setup lang="ts">
/**
 * `LandFeedsControl` — the Settings → LAND → LIVE FEEDS editor: Durham CC and
 * TfL JamCams traffic-camera feeds in P0, cloned from `SdrDevicesControl`'s
 * list/add/edit/delete shape.
 *
 * Unlike the SDR devices list, a feed has no dedicated create/update/delete
 * endpoint of its own — the whole `land.feeds` array is one settings value
 * (see the P0 contract), so every local edit (add, edit, delete, and any
 * credential change bundled with an edit) is folded into a single staged
 * writer that APPLY CHANGES invokes. `draftFeeds` is the local working copy;
 * it re-syncs from the store whenever the panel closes, so a reopened card
 * always starts from what is actually persisted.
 */
import { onMounted, ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LandFeedForm from './LandFeedForm.vue'
import LandFeedRow from './LandFeedRow.vue'
import { useLandFeedsStore } from '@/stores/landFeeds'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import type { FeedConfig, FeedWithStatus } from '@/types/landFeeds'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const landFeedsStore = useLandFeedsStore()

const draftFeeds = ref<FeedConfig[]>([])
const statusById = ref<Record<string, FeedWithStatus['status']>>({})
const openId = ref<string | 'new' | null>(null)
const confirmId = ref<string | null>(null)

/** Credential writes queued by edited feeds, keyed by feed id — folded into
 *  the combined staged writer alongside the feed-list write. Re-queuing under
 *  the same id (editing a feed twice before APPLY) simply replaces the
 *  earlier op, which is correct: only the latest edit should apply. */
const credentialOps = new Map<string, () => Promise<unknown>>()

function stripStatus(feeds: FeedWithStatus[]): FeedConfig[] {
  return feeds.map(({ status: _status, ...config }) => config)
}

async function loadDraft(): Promise<void> {
  await landFeedsStore.loadFeeds()
  draftFeeds.value = stripStatus(landFeedsStore.feeds)
  statusById.value = Object.fromEntries(landFeedsStore.feeds.map((feed) => [feed.id, feed.status]))
  credentialOps.clear()
}

onMounted(() => {
  void loadDraft()
})
// APPLY CHANGES closes the panel; re-read so a reopened card reflects what
// was actually persisted (and drops any queued-but-unapplied credential ops).
useDocumentEvent('settings-panel-closed', () => void loadDraft())

/** Stage one combined writer covering the current draft list and every
 *  queued credential op — re-staging on every edit overwrites the previous
 *  attempt under the same settings-item id, which is correct since this
 *  closure always reads the latest `draftFeeds`/`credentialOps`. */
function stageAll(): void {
  emit('stage', async () => {
    await landFeedsStore.saveFeeds(draftFeeds.value)
    for (const op of credentialOps.values()) await op()
    credentialOps.clear()
  })
}

function toggleEdit(id: string): void {
  openId.value = openId.value === id ? null : id
  confirmId.value = null
}

function toggleNew(): void {
  openId.value = openId.value === 'new' ? null : 'new'
  confirmId.value = null
}

function startDelete(id: string): void {
  confirmId.value = id
  openId.value = null
}

function confirmDelete(id: string): void {
  draftFeeds.value = draftFeeds.value.filter((feed) => feed.id !== id)
  credentialOps.delete(id)
  confirmId.value = null
  stageAll()
}

function onFormSave(feed: FeedConfig, credentialOp: (() => Promise<unknown>) | undefined): void {
  const index = draftFeeds.value.findIndex((existing) => existing.id === feed.id)
  draftFeeds.value =
    index === -1
      ? [...draftFeeds.value, feed]
      : draftFeeds.value.map((existing, currentIndex) => (currentIndex === index ? feed : existing))
  if (credentialOp) credentialOps.set(feed.id, credentialOp)
  openId.value = null
  stageAll()
}
</script>
