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
    <BaseButton
      variant="danger"
      class="tle-action-btn"
      :class="
        confirmPending ? 'tle-action-btn--danger tle-action-btn--confirm' : 'tle-action-btn--danger'
      "
      :style="clearAllButtonStyle"
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
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SATELLITE_CATEGORY_FULL_LABELS, formatTleAge } from '../utils/satelliteUtils'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'

type CatInfo = { count: number; last_updated: number }

const summary = ref('Loading…')
const byCategory = ref<Record<string, CatInfo>>({})
const confirmPending = ref(false)
const clearLoading = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

// While a second click is pending, the CLEAR ALL button swaps to the amber
// "confirm this?" tint (matching the pre-BaseButton `.tle-action-btn--confirm`
// look) via the danger variant's `--ba-danger-*` custom-property hooks. Hover
// is deliberately left at its default red — the original CSS's cascade let
// `.tle-action-btn--danger:hover` win over `--confirm` on hover too.
// `--ba-disabled-*` matches the pre-BaseButton `.tle-action-btn:disabled`
// look (lighter opacity, default cursor) rather than BaseButton's shared
// default disabled treatment.
const clearAllButtonStyle = computed(
  () =>
    '--ba-disabled-opacity: 0.4; --ba-disabled-cursor: default;' +
    (confirmPending.value
      ? ' --ba-danger-bg: rgba(214, 140, 0, 0.14); --ba-danger-color: #946000;'
      : ''),
)

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

<style scoped>
.tle-db-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* Caps the category table AND the right-aligned CLEAR ALL button below it, so
     the button's right edge lands on the table's, not the card's. */
  max-width: var(--settings-control-measure);
}

.tle-db-summary {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  font-weight: 500;
  letter-spacing: 0.06em;
  /* Small text: 0.5 ink fell under AA (3.4:1) on the panel's surface. */
  color: rgba(var(--ink-rgb), 0.68);
}

.tle-cat-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.tle-cat-row {
  display: grid;
  grid-template-columns: 1fr 48px 90px 58px;
  align-items: center;
  padding: 11px 14px;
  background: rgba(var(--ink-rgb), 0.02);
}

.tle-cat-name {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.7);
}

.tle-cat-count {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-value);
  font-weight: 700;
  color: rgba(var(--ink-rgb), 0.7);
  text-align: right;
  padding-right: 16px;
}

.tle-cat-age {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  color: var(--ink-secondary);
  text-align: right;
  letter-spacing: 0.04em;
}

.tle-cat-clear {
  justify-self: end;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.5);
  background: var(--hover-surface);
  border: none;
  border-radius: 0;
  padding: 4px 9px;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
  white-space: nowrap;
}

.tle-cat-clear:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-soft);
}

.tle-cat-clear:disabled {
  opacity: 0.4;
  cursor: default;
}

.tle-cat-clear--confirm {
  color: var(--warn-text);
  background: var(--warn-soft);
}

/* CLEAR ALL TLE DATA: solid red (not the variant's pink tint), sized to its
   label and right-aligned instead of stretching the card's full width. The
   amber confirm state still wins — its vars are set inline on the element,
   which outranks these. Hover is overridden too (the atom hardcodes a pink
   hover fill); the #settings-panel ancestor is what out-specifies the atom's
   own hover rule. One shade darker than --danger, which is under AA (4.35:1)
   behind the white label; hover goes darker again. */
.tle-action-btn--danger {
  --ba-danger-bg: var(--danger-hover);
  --ba-danger-color: var(--surface-raised);
  align-self: flex-end;
}

#settings-panel .tle-action-btn--danger:hover:not(:disabled) {
  background: var(--danger-strong);
  color: var(--surface-raised);
}
</style>
