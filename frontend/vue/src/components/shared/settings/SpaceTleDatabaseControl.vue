<template>
  <div class="tle-db-wrap">
    <div class="tle-db-summary">{{ summary }}</div>
    <div class="tle-cat-table">
      <div v-for="[cat, info] in sortedCategories" :key="cat" class="tle-cat-row">
        <span class="tle-cat-name">{{ SATELLITE_CATEGORY_FULL_LABELS[cat] ?? cat }}</span>
        <span class="tle-cat-count">{{ info.count }}</span>
        <span class="tle-cat-age">{{ info.last_updated ? formatTleAge(info.last_updated) : '—' }}</span>
      </div>
    </div>
    <button
      class="tle-action-btn"
      :class="confirmPending ? 'tle-action-btn--danger tle-action-btn--confirm' : 'tle-action-btn--danger'"
      :disabled="clearLoading"
      @click="clearAll"
    >{{ clearLoading ? 'CLEARING…' : confirmPending ? 'CONFIRM — CLEAR ALL TLE DATA?' : 'CLEAR ALL TLE DATA' }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SATELLITE_CATEGORY_FULL_LABELS, formatTleAge } from '../../../utils/satelliteUtils'
import { useDocumentEvent } from '../../../composables/useDocumentEvent'

type CatInfo = { count: number; last_updated: number }

const summary = ref('Loading…')
const byCategory = ref<Record<string, CatInfo>>({})
const confirmPending = ref(false)
const clearLoading = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

const sortedCategories = computed(() =>
  Object.entries(byCategory.value).sort((a, b) => a[0].localeCompare(b[0]))
)

async function load(): Promise<void> {
  try {
    const resp = await fetch('/api/space/tle/status')
    if (!resp.ok) throw new Error(resp.statusText)
    const data = await resp.json() as {
      total: number; uncategorised: number;
      by_source: Record<string, number>; by_category: Record<string, CatInfo>
    }
    const srcParts = Object.entries(data.by_source).map(([s, n]) => `${s} (${n})`).join(' · ')
    summary.value = `${data.total} satellites · ${srcParts || 'none'}`
    byCategory.value = data.by_category
  } catch { summary.value = 'Failed to load TLE status' }
}

async function clearAll(): Promise<void> {
  if (!confirmPending.value) {
    confirmPending.value = true
    confirmTimer = setTimeout(() => { confirmPending.value = false }, 4000)
    return
  }
  if (confirmTimer) clearTimeout(confirmTimer)
  clearLoading.value = true
  try {
    const resp = await fetch('/api/space/tle?confirm=true', { method: 'DELETE' })
    if (!resp.ok) throw new Error((await resp.json() as { error?: string }).error ?? resp.statusText)
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
  } catch (err) {
    summary.value = 'Error: ' + (err as Error).message
  } finally {
    confirmPending.value = false
    clearLoading.value = false
  }
}

function onRefresh(): void { load() }

onMounted(() => { load() })
onUnmounted(() => { if (confirmTimer) clearTimeout(confirmTimer) })
useDocumentEvent('tle:refreshStatus', onRefresh)
</script>
