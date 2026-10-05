<template>
  <div
    id="settings-panel"
    ref="panelRef"
    class="theme-light"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-section-heading"
    tabindex="-1"
    :class="{ 'settings-panel-visible': store.open }"
    @keydown="onKeydown"
  >
    <!-- The panel is a light island; `theme-dark` keeps its rail charcoal, so
         it matches the app's rails outside the panel. -->
    <div
      id="settings-sidebar"
      class="theme-dark"
      :class="{ 'settings-sidebar--collapsed': !store.sidebarOpen }"
    >
      <BaseIconButton
        v-for="s in visibleSections"
        :key="s.key"
        class="settings-nav-item"
        :class="{ active: activeSection === s.key }"
        :bordered="true"
        :active="activeSection === s.key"
        tooltip-side="right"
        :tooltip="s.label"
        :accessible-name="s.label"
        :aria-pressed="activeSection === s.key"
        @click="selectSection(s.key)"
      >
        <span class="settings-nav-icon-wrap">
          <!-- App Settings: sliders icon -->
          <svg
            v-if="s.key === 'app'"
            class="settings-nav-icon"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <line
              x1="4"
              y1="6"
              x2="20"
              y2="6"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <circle cx="15" cy="6" r="2.5" stroke="currentColor" stroke-width="1.8" />
            <line
              x1="4"
              y1="13"
              x2="20"
              y2="13"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <circle cx="9" cy="13" r="2.5" stroke="currentColor" stroke-width="1.8" />
            <line
              x1="4"
              y1="20"
              x2="20"
              y2="20"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <circle cx="14" cy="20" r="2.5" stroke="currentColor" stroke-width="1.8" />
          </svg>
          <!-- AIR: civil aircraft (matches AirSideMenu civil filter icon) -->
          <svg
            v-else-if="s.key === 'air'"
            class="settings-nav-icon"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 2C12.8 2 13.2 3.6 13.2 6.6 L21 11.5 V13.4 L13.2 11 V16.5 L15.5 18.5 V20 L12 19 L8.5 20 V18.5 L10.8 16.5 V11 L3 13.4 V11.5 L10.8 6.6 C10.8 3.6 11.2 2 12 2Z"
              fill="currentColor"
            />
          </svg>
          <!-- SPACE: planet Earth (globe with meridian and equator) -->
          <svg
            v-else-if="s.key === 'space'"
            class="settings-nav-icon"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
            <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" stroke-width="1.8" />
            <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.8" />
          </svg>
          <!-- SEA: sailboat icon -->
          <svg
            v-else-if="s.key === 'sea'"
            class="settings-nav-icon"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <line
              x1="12"
              y1="16"
              x2="12"
              y2="3"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M12 4L5 15h7V4z"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
            <path d="M3 16h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <path
              d="M3 16l1.5 4.5h15L21 16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <!-- LAND: mountain terrain icon -->
          <svg
            v-else-if="s.key === 'land'"
            class="settings-nav-icon"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 20L8 7l4 6.5L16 5l6 15H2z"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
          </svg>
          <!-- SDR (default): radio (matches SdrPanel radio tab icon) -->
          <RadioIcon v-else class="settings-nav-icon" />
        </span>
      </BaseIconButton>
    </div>

    <div id="settings-content">
      <div id="settings-section-heading">
        <span class="settings-heading-dot" aria-hidden="true"></span>
        <span>{{ sectionHeading }}</span>
      </div>

      <div
        id="settings-search-wrap"
        :class="{ 'settings-search-wrap--hidden': activeSection !== 'app' && !searchQuery }"
      >
        <div id="settings-search-inner">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" />
            <line
              x1="9.5"
              y1="9.5"
              x2="13"
              y2="13"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
          </svg>
          <input
            id="settings-search-input"
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            aria-label="Search settings"
            placeholder="SEARCH SETTINGS"
            autocomplete="off"
            spellcheck="false"
          />
          <BaseIconAction
            id="settings-search-clear"
            accessible-name="Clear search"
            :active="searchQuery.length > 0"
            active-class="settings-search-clear-visible"
            @click="clearSearch"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <line
                x1="2"
                y1="2"
                x2="10"
                y2="10"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
              <line
                x1="10"
                y1="2"
                x2="2"
                y2="10"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
            </svg>
          </BaseIconAction>
        </div>
      </div>

      <div id="settings-body">
        <!-- Search results -->
        <template v-if="searchQuery.trim()">
          <template v-if="searchResults.length === 0">
            <div class="settings-empty">No results found</div>
          </template>
          <template v-else>
            <div class="settings-grid">
              <template v-for="group in searchResultGroups" :key="group.section">
                <div class="settings-section-label">{{ group.sectionLabel }}</div>
                <SettingRow
                  v-for="item in group.items"
                  :key="item.id"
                  :item="item"
                  :pending="pending"
                  @stage="stagePending"
                  @commit="commitAll"
                />
              </template>
            </div>
          </template>
        </template>

        <!-- Section items -->
        <template v-else>
          <template v-if="currentSectionItems.length === 0">
            <div class="settings-empty">Settings coming soon</div>
          </template>
          <template v-else>
            <div class="settings-grid">
              <template v-for="(item, idx) in currentSectionItems" :key="item.id">
                <div
                  v-if="
                    item.groupLabel !== undefined &&
                    item.groupLabel !== currentSectionItems[idx - 1]?.groupLabel
                  "
                  class="settings-group-label"
                  :class="{ 'settings-group-label--spaced': idx > 0 }"
                >
                  {{ item.groupLabel }}
                </div>
                <SettingRow
                  :item="item"
                  :pending="pending"
                  @stage="stagePending"
                  @commit="commitAll"
                />
              </template>
            </div>
          </template>
        </template>
      </div>

      <div id="settings-footer">
        <span id="settings-apply-status" :class="applyStatusClass">{{ applyStatusMsg }}</span>
        <BaseButton id="settings-apply-btn" variant="primary" @click="commitAll"
          >APPLY CHANGES</BaseButton
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import './SettingsPanel.css'
import RadioIcon from '@sentinel/ui/icons/RadioIcon.vue'
import { ref, computed, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import { useDialog } from '@/composables/useDialog'
import type { SettingItem } from '@/types/settings'
import SettingRow from './settings/SettingRow.vue'
import './settings/appSettings'
import { getSettingItems, getSettingsSections } from '@/shell/settingsRegistry'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'

// Re-exported for back-compat: this type used to be defined here. Prefer
// importing from '@/types/settings' directly in new code.
export type { SettingItem }

const store = useSettingsStore()
const appStore = useAppStore()

const activeSection = ref('app')
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

// Modal-dialog behaviour: trap focus while open, Escape to close, restore focus
// to the trigger on close (WCAG 4.1.2 / 2.4.3 / 2.1.2). The panel is display:none
// when closed, so it leaves the a11y tree without needing aria-hidden.
const { onKeydown } = useDialog({
  isOpen: computed(() => store.open),
  container: panelRef,
  onClose: () => store.closePanel(),
  // Focus the dialog container (tabindex="-1") rather than the search field, so
  // the modal focus contract still holds (focus enters the dialog, Escape +
  // tab-trapping work) without auto-highlighting the search input on open.
  initialFocus: () => panelRef.value,
})
const pending = ref<Map<string, () => Promise<unknown> | void>>(new Map())
const applyStatusMsg = ref('')
const applyStatusClass = ref('')

// Every Settings section and item comes from the registry: core registers
// 'app' (./settings/appSettings), each section registers its own (F3). A domain
// section is offered — in the nav and in search — only while it is enabled.
const navSections = getSettingsSections()
const allSettings = getSettingItems()
const domainSectionKeys = new Set(
  navSections.filter((section) => section.domain).map((section) => section.key),
)
function isSectionOffered(key: string): boolean {
  return !domainSectionKeys.has(key) || appStore.enabledDomains.includes(key)
}
const visibleSections = computed(() => navSections.filter((s) => isSectionOffered(s.key)))

const sectionHeading = computed(() => {
  if (searchQuery.value.trim()) return 'SEARCH RESULTS'
  const s = navSections.find((n) => n.key === activeSection.value)
  if (!s) return activeSection.value
  return s.key === 'app' ? s.label : s.label + ' SETTINGS'
})

const currentSectionItems = computed(() =>
  allSettings.filter((s) => s.section === activeSection.value),
)

const searchResults = computed<SettingItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  /* v8 ignore start -- searchResults is only read while a search query is active
     (it sits behind v-if="searchQuery.trim()"), so q is never empty here */
  if (!q) return []
  /* v8 ignore stop */
  return allSettings.filter(
    (s) =>
      isSectionOffered(s.section) &&
      (s.label.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        (s.searchTerms?.toLowerCase().includes(q) ?? false) ||
        s.sectionLabel.toLowerCase().includes(q)),
  )
})

const searchResultGroups = computed(() => {
  const groups: Record<string, { section: string; sectionLabel: string; items: SettingItem[] }> = {}
  const order: string[] = []
  searchResults.value.forEach((item) => {
    if (!groups[item.section]) {
      groups[item.section] = { section: item.section, sectionLabel: item.sectionLabel, items: [] }
      order.push(item.section)
    }
    groups[item.section].items.push(item)
  })
  return order.map((k) => groups[k])
})

function selectSection(key: string): void {
  activeSection.value = key
  searchQuery.value = ''
  pending.value.clear()
}

function clearSearch(): void {
  searchQuery.value = ''
  searchInputRef.value?.focus()
}

function stagePending(id: string, fn: () => Promise<unknown> | void): void {
  pending.value.set(id, fn)
}

function showApplyStatus(msg: string, isError: boolean): void {
  applyStatusMsg.value = msg
  applyStatusClass.value = isError ? 'settings-apply-status--error' : 'settings-apply-status--ok'
  setTimeout(() => {
    applyStatusMsg.value = ''
    applyStatusClass.value = ''
  }, 2500)
}

async function commitAll(): Promise<void> {
  if (pending.value.size === 0) {
    showApplyStatus('NO CHANGES', false)
    return
  }
  const promises: Promise<unknown>[] = []
  let hasError = false
  pending.value.forEach((fn) => {
    try {
      const result = fn()
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        promises.push(result as Promise<unknown>)
      }
    } catch {
      hasError = true
    }
  })
  if (hasError) {
    showApplyStatus('ERROR', true)
    return
  }
  try {
    await Promise.all(promises)
  } catch {
    showApplyStatus('ERROR', true)
    return
  }
  pending.value.clear()
  showApplyStatus('SAVED', false)
  // Hold long enough for the SAVED confirmation to be clearly visible before the
  // page reloads (the reload re-hydrates settings that need a fresh app start).
  setTimeout(() => {
    try {
      sessionStorage.setItem('sentinel_settings_reopen', activeSection.value)
    } catch {}
    location.reload()
  }, 1200)
}

watch(
  () => store.open,
  (isOpen) => {
    if (isOpen) {
      // Focus-in is handled by useDialog; here we only resolve which section opens.
      if (store.activeSection) {
        activeSection.value = store.activeSection
      }
      try {
        const reopenSection = sessionStorage.getItem('sentinel_settings_reopen')
        if (reopenSection) {
          sessionStorage.removeItem('sentinel_settings_reopen')
          activeSection.value = reopenSection
        }
      } catch {}
    } else {
      searchQuery.value = ''
      pending.value.clear()
    }
  },
)
</script>
