<template>
  <div class="settings-datasource-wrap tle-online-wrap">
    <div class="settings-datasource-row">
      <span class="settings-datasource-label">URL</span>
      <input
        v-model="urlValue"
        type="url"
        class="settings-datasource-input"
        placeholder="https://celestrak.org/..."
        spellcheck="false"
        autocomplete="off"
      >
    </div>
    <div class="tle-cat-row-ctrl">
      <span class="settings-datasource-label tle-inline-label">CATEGORY</span>
      <div class="tle-dropdown" :class="{ 'tle-dropdown--open': dropOpen }" tabindex="0" @blur="dropOpen = false">
        <div class="tle-dropdown-selected" @mousedown.prevent="dropOpen = !dropOpen">
          <span class="tle-dropdown-selected-text" :class="{ 'tle-dropdown-selected-text--chosen': selectedCategory }">
            {{ selectedCategoryLabel }}
          </span>
          <span class="tle-dropdown-arrow"></span>
        </div>
        <div class="tle-dropdown-menu" :class="{ 'tle-dropdown-menu--open': dropOpen }">
          <div
            v-for="opt in TLE_CATEGORIES"
            :key="opt.value"
            class="tle-dropdown-item"
            @mousedown.prevent="selectCategory(opt.value)"
          >{{ opt.label }}</div>
        </div>
      </div>
      <button
        class="tle-action-btn tle-action-btn--primary"
        :disabled="updateLoading"
        @click="updateTle"
      >{{ updateLoading ? 'UPDATING…' : 'UPDATE TLE' }}</button>
    </div>
    <div class="tle-status-line">
      <span v-if="statusMsg" class="tle-status-badge" :class="'tle-status-badge--' + statusType">{{ statusMsg }}</span>
    </div>
    <div class="tle-info-row">
      <div class="tle-info-row-header" @click="infoOpen = !infoOpen">
        <span class="tle-info-label">View Celestrak source URLs</span>
        <span class="tle-info-chevron" :class="{ 'tle-info-chevron--open': infoOpen }">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><polyline points="1,2.5 4,5.5 7,2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <div v-if="infoOpen" class="tle-info-panel">
        <div class="tle-info-list">
          <div v-for="cat in TLE_CATEGORIES.filter(c => c.value && effectiveUrls[c.value])" :key="cat.value" class="tle-info-list-item">
            <span class="tle-info-list-label">{{ cat.label }}</span>
            <span class="tle-info-list-sep">:</span>
            <a class="tle-info-table-url" :href="effectiveUrls[cat.value]" target="_blank" rel="noopener noreferrer">{{ effectiveUrls[cat.value] }}</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as settingsApi from '@/services/settingsApi'

const TLE_CATEGORIES = [
  { value: 'active',        label: 'All Active (no category)' },
  { value: 'space_station', label: 'Space Stations' },
  { value: 'amateur',       label: 'Amateur Radio' },
  { value: 'weather',       label: 'Weather' },
  { value: 'military',      label: 'Military' },
  { value: 'navigation',    label: 'Navigation (GNSS)' },
  { value: 'science',       label: 'Science' },
  { value: 'cubesat',       label: 'CubeSats' },
  { value: 'unknown',       label: 'Unknown' },
]

const CELESTRAK_URLS: Record<string, string> = {
  space_station: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  amateur:       'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle',
  weather:       'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
  military:      'https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle',
  navigation:    'https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=tle',
  science:       'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle',
  cubesat:       'https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle',
  active:        'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
  unknown:       'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
}

const LS_KEY = 'sentinel_space_onlineUrl'
const effectiveUrls = ref<Record<string, string>>({ ...CELESTRAK_URLS })
const selectedCategory = ref('active')
const dropOpen = ref(false)
const urlValue = ref('')
const updateLoading = ref(false)
const statusMsg = ref('')
const statusType = ref<'ok' | 'error' | 'info'>('ok')
const infoOpen = ref(false)

const selectedCategoryLabel = computed(() =>
  TLE_CATEGORIES.find(c => c.value === selectedCategory.value)?.label ?? selectedCategory.value
)

try {
  const saved = localStorage.getItem(LS_KEY)
  const migrated = saved
    ? saved.replace(/FORMAT=TLE\b/, 'FORMAT=tle').replace(/CATNR=25544/, 'GROUP=active')
    : null
  if (migrated && migrated !== saved) localStorage.setItem(LS_KEY, migrated)
  urlValue.value = migrated || effectiveUrls.value['active']!
} catch {
  urlValue.value = effectiveUrls.value['active']!
}

onMounted(async () => {
  const data = await settingsApi.getNamespace('space')
  if (!data) return
  if (data.onlineUrls && typeof data.onlineUrls === 'object') {
    Object.assign(effectiveUrls.value, data.onlineUrls as Record<string, string>)
    const cur = selectedCategory.value
    if (cur && effectiveUrls.value[cur]) {
      urlValue.value = effectiveUrls.value[cur]!
      try { localStorage.setItem(LS_KEY, urlValue.value) } catch {}
    }
  }
  if (data.onlineUrl && !urlValue.value) {
    urlValue.value = data.onlineUrl as string
    try { localStorage.setItem(LS_KEY, urlValue.value) } catch {}
  }
})

function selectCategory(val: string): void {
  selectedCategory.value = val
  dropOpen.value = false
  urlValue.value = effectiveUrls.value[val] ?? ''
}

async function updateTle(): Promise<void> {
  const url = urlValue.value.trim()
  if (!url) { statusMsg.value = 'Enter a URL first'; statusType.value = 'error'; return }
  try { localStorage.setItem(LS_KEY, url) } catch {}
  settingsApi.put('space', 'onlineUrl', url)
  updateLoading.value = true
  statusMsg.value = ''
  try {
    const resp = await fetch('/api/space/tle/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, category: selectedCategory.value || null }),
    })
    const data = await resp.json() as { inserted?: number; updated?: number; error?: string }
    if (!resp.ok) throw new Error(data.error || resp.statusText)
    statusMsg.value = `${(data.inserted ?? 0) + (data.updated ?? 0)} satellites loaded · ${data.inserted ?? 0} new · ${data.updated ?? 0} updated`
    statusType.value = 'ok'
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
  } catch (err) {
    statusMsg.value = 'Error: ' + (err as Error).message
    statusType.value = 'error'
  } finally {
    updateLoading.value = false
  }
}
</script>
