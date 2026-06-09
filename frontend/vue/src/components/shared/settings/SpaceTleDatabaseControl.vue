<template>
  <div class="tle-db-wrap">
    <div class="tle-db-summary">{{ summary }}</div>
    <div class="tle-cat-table">
      <div v-for="[cat, info] in sortedCategories" :key="cat" class="tle-cat-row">
        <span class="tle-cat-name">{{ SATELLITE_CATEGORY_FULL_LABELS[cat] ?? cat }}</span>
        <span class="tle-cat-count">{{ info.count }}</span>
        <span class="tle-cat-age">{{
          info.last_updated ? formatTleAge(info.last_updated) : '—'
        }}</span>
        <button
          class="tle-cat-clear"
          :class="{ 'tle-cat-clear--confirm': confirmCat === cat }"
          :disabled="clearingCat !== null"
          :title="confirmCat === cat ? 'Confirm clear' : 'Clear this category'"
          @click="clearCategory(cat)"
        >
          {{ clearingCat === cat ? '…' : confirmCat === cat ? 'CONFIRM?' : 'CLEAR' }}
        </button>
      </div>
    </div>
    <button
      class="tle-action-btn"
      :class="
        confirmPending ? 'tle-action-btn--danger tle-action-btn--confirm' : 'tle-action-btn--danger'
      "
      :disabled="clearLoading"
      @click="clearAll"
    >
      {{
        clearLoading
          ? 'CLEARING…'
          : confirmPending
            ? 'CONFIRM — CLEAR ALL TLE DATA?'
            : 'CLEAR ALL TLE DATA'
      }}
    </button>
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

// Per-category clear: two-step confirm (one category at a time) mirroring CLEAR ALL.
const confirmCat = ref<string | null>(null)
const clearingCat = ref<string | null>(null)
let catConfirmTimer: ReturnType<typeof setTimeout> | null = null

const sortedCategories = computed(() =>
  Object.entries(byCategory.value).sort((a, b) => a[0].localeCompare(b[0])),
)

async function load(): Promise<void> {
  try {
    const resp = await fetch('/api/space/tle/status')
    if (!resp.ok) throw new Error(resp.statusText)
    const data = (await resp.json()) as {
      total: number
      uncategorised: number
      by_source: Record<string, number>
      by_category: Record<string, CatInfo>
    }
    const srcParts = Object.entries(data.by_source)
      .map(([s, n]) => `${s} (${n})`)
      .join(' · ')
    summary.value = `${data.total} satellites · ${srcParts || 'none'}`
    byCategory.value = data.by_category
  } catch {
    summary.value = 'Failed to load TLE status'
  }
}

async function clearAll(): Promise<void> {
  if (!confirmPending.value) {
    confirmPending.value = true
    confirmTimer = setTimeout(() => {
      confirmPending.value = false
    }, 4000)
    return
  }
  /* v8 ignore start -- defensive: confirmTimer is always set by the first-click
     branch above before the confirm step runs, so it is never null here */
  if (confirmTimer) clearTimeout(confirmTimer)
  /* v8 ignore stop */
  clearLoading.value = true
  try {
    const resp = await fetch('/api/space/tle?confirm=true', { method: 'DELETE' })
    if (!resp.ok)
      throw new Error(((await resp.json()) as { error?: string }).error ?? resp.statusText)
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
  } catch (err) {
    summary.value = 'Error: ' + (err as Error).message
  } finally {
    confirmPending.value = false
    clearLoading.value = false
  }
}

async function clearCategory(cat: string): Promise<void> {
  if (confirmCat.value !== cat) {
    confirmCat.value = cat
    if (catConfirmTimer) clearTimeout(catConfirmTimer)
    catConfirmTimer = setTimeout(() => {
      confirmCat.value = null
    }, 4000)
    return
  }
  /* v8 ignore start -- defensive: catConfirmTimer is always set by the
     first-click branch above before the confirm step runs */
  if (catConfirmTimer) clearTimeout(catConfirmTimer)
  /* v8 ignore stop */
  confirmCat.value = null
  clearingCat.value = cat
  try {
    const resp = await fetch(`/api/space/tle?confirm=true&category=${encodeURIComponent(cat)}`, {
      method: 'DELETE',
    })
    if (!resp.ok)
      throw new Error(((await resp.json()) as { error?: string }).error ?? resp.statusText)
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
  } catch (err) {
    summary.value = 'Error: ' + (err as Error).message
  } finally {
    clearingCat.value = null
  }
}

function onRefresh(): void {
  load()
}

onMounted(() => {
  load()
})
onUnmounted(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
  if (catConfirmTimer) clearTimeout(catConfirmTimer)
})
useDocumentEvent('tle:refreshStatus', onRefresh)
</script>
