<template>
  <div class="tle-satlist-wrap">
    <button
      class="tle-satlist-toggle-btn"
      :aria-expanded="open"
      aria-controls="tle-satlist-body"
      :aria-label="open ? 'Hide satellite list' : 'Show satellite list'"
      @click="open = !open"
    >
      <svg
        class="tle-satlist-chevron"
        :class="{ 'tle-satlist-chevron--open': open }"
        width="12"
        height="12"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 2L7 5L3 8"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <div
      id="tle-satlist-body"
      class="tle-satlist-body"
      :class="{ 'tle-satlist-body--hidden': !open }"
    >
      <div class="settings-datasource-row tle-satlist-search-row">
        <span class="settings-datasource-label">SEARCH</span>
        <input
          v-model="searchQuery"
          type="text"
          class="settings-datasource-input"
          aria-label="Search satellites by name, NORAD ID or category"
          placeholder="Filter by name, NORAD ID or category…"
          spellcheck="false"
        />
      </div>
      <div class="tle-satlist-table">
        <div v-if="loading" class="tle-satlist-loading">Loading…</div>
        <div v-else-if="loadError" class="tle-satlist-loading">{{ loadError }}</div>
        <template v-else>
          <div v-for="sat in filteredSats" :key="sat.norad_id" class="tle-satlist-row">
            <span
              class="tle-satlist-name"
              :class="{ 'tle-satlist-name--user': sat.name_source === 'user' }"
              >{{ sat.name }}</span
            >
            <span class="tle-satlist-id">{{ sat.norad_id }}</span>
            <span class="tle-satlist-cat" :class="{ 'tle-satlist-cat--none': !sat.category }">{{
              sat.category ? (SATELLITE_CATEGORY_FULL_LABELS[sat.category] ?? sat.category) : '—'
            }}</span>
            <span class="tle-satlist-age">{{
              sat.updated_at ? formatTleAge(sat.updated_at) : '—'
            }}</span>
          </div>
        </template>
      </div>
      <div class="tle-satlist-count">{{ countLine }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SATELLITE_CATEGORY_FULL_LABELS, formatTleAge } from '../../../utils/satelliteUtils'
import { useDocumentEvent } from '../../../composables/useDocumentEvent'

type SatRow = {
  norad_id: string
  name: string
  category: string | null
  name_source?: string | null
  updated_at: number
}

const allSats = ref<SatRow[]>([])
const searchQuery = ref('')
const loading = ref(true)
const loadError = ref('')
const open = ref(false)

const filteredSats = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allSats.value
  return allSats.value.filter((s) => {
    const catLabel = s.category ? (SATELLITE_CATEGORY_FULL_LABELS[s.category] ?? s.category) : ''
    return (
      s.name.toLowerCase().includes(q) ||
      s.norad_id.includes(q) ||
      catLabel.toLowerCase().includes(q)
    )
  })
})

const countLine = computed(() =>
  loading.value || loadError.value
    ? ''
    : `${filteredSats.value.length} of ${allSats.value.length} satellites`,
)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const resp = await fetch('/api/space/tle/list')
    if (!resp.ok) throw new Error(resp.statusText)
    const data = (await resp.json()) as { satellites: SatRow[] }
    allSats.value = data.satellites
  } catch (err) {
    loadError.value = 'Failed to load: ' + (err as Error).message
  } finally {
    loading.value = false
  }
}

function onRefresh(): void {
  load()
}

onMounted(() => {
  load()
})
useDocumentEvent('tle:refreshStatus', onRefresh)
</script>
