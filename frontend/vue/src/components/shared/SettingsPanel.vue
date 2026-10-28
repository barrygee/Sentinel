<template>
  <div
    id="settings-panel"
    ref="panelRef"
    class="theme-light light-island"
    :role="pinned ? 'region' : 'dialog'"
    :aria-modal="pinned ? undefined : 'true'"
    aria-labelledby="settings-section-heading"
    tabindex="-1"
    :class="{ 'settings-panel-visible': store.open, 'settings-panel--pinned': pinned }"
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
          <SectionIcon :section-key="s.key" class="settings-nav-icon" />
        </span>
      </BaseIconButton>

      <!-- Docs: the only way into /docs. A link, not a section button: it leaves
           Settings for another page (the route change closes this panel), so it
           never takes the active bar. Sits straight under the section buttons.
           Absent when the deployment leaves the optional docs service out. -->
      <RouterLink v-if="docsDeployment.deployed" v-slot="{ href, navigate }" to="/docs/" custom>
        <BaseIconLink
          class="settings-nav-docs"
          :href="href"
          :bordered="true"
          tooltip-side="right"
          tooltip="DOCS"
          accessible-name="Docs (documentation)"
          @click="navigate"
        >
          <span class="settings-nav-icon-wrap">
            <SectionIcon section-key="docs" class="settings-nav-icon" />
          </span>
        </BaseIconLink>
      </RouterLink>
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
        <BaseSearchField
          id="settings-search-inner"
          v-model="searchQuery"
          input-id="settings-search-input"
          input-type="text"
          clear-id="settings-search-clear"
          label="Search settings"
          placeholder="SEARCH SETTINGS"
          :landmark="false"
        />
      </div>

      <div id="settings-body">
        <!-- Search results -->
        <template v-if="searchQuery.trim()">
          <template v-if="!anySearchResultShown">
            <div class="settings-empty">No results found</div>
          </template>
          <template v-else>
            <div class="settings-grid">
              <template v-for="group in searchResultGroups" :key="group.section">
                <div v-show="group.items.some(isShownInSourceMode)" class="settings-section-label">
                  {{ group.sectionLabel }}
                </div>
                <SettingRow
                  v-for="item in group.items"
                  v-show="isShownInSourceMode(item)"
                  :key="item.id"
                  :item="item"
                  :pending="pending"
                  start-open
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
                  v-show="isShownInSourceMode(item)"
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
import '@/assets/lightIsland.css'
import './SettingsPanel.css'
import SectionIcon from './SectionIcon.vue'
import { ref, computed, watch } from 'vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useDocsDeploymentStore } from '@sentinel/shell-api/stores/docsDeployment'
import {
  forgetShownSettingsSourceModes,
  shownSettingsSourceMode,
} from '@sentinel/shell-api/settings/settingsSourceModes'
import { useDialog } from '@/composables/useDialog'
import type { SettingItem } from '@sentinel/shell-api/types/settings'
import SettingRow from './settings/SettingRow.vue'
import './settings/appSettings'
import { getSettingItems } from '@sentinel/shell-api/shell/settingsRegistry'
import { useOfferedSettingsSections } from '@/composables/useOfferedSettingsSections'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseSearchField from '@sentinel/ui/base/BaseSearchField.vue'
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'
import BaseIconLink from '@sentinel/ui/base/BaseIconLink.vue'
import { refreshSettingsFromBackend } from '@/shell/applySettings'
import { createSearchRecord, searchRecords } from '@/search/textSearch'
import { isOfferedInAppMode } from '@/shell/appMode'

// Re-exported for back-compat: this type used to be defined here. Prefer
// importing from '@sentinel/shell-api/types/settings' directly in new code.
export type { SettingItem }

const props = withDefaults(
  defineProps<{
    /**
     * The panel is the whole page (SDR Manager-only mode) rather than a dialog
     * over the map: a landmark region in the page's flow, with no focus trap
     * and no Escape to close, since there is nothing behind it to return to.
     */
    pinned?: boolean
  }>(),
  { pinned: false },
)

const store = useSettingsStore()
const appStore = useAppStore()
const docsDeployment = useDocsDeploymentStore()

const activeSection = ref('app')
const searchQuery = ref('')
const panelRef = ref<HTMLElement | null>(null)

// Modal-dialog behaviour: trap focus while open, Escape to close, restore focus
// to the trigger on close (WCAG 4.1.2 / 2.4.3 / 2.1.2). The panel is display:none
// when closed, so it leaves the a11y tree without needing aria-hidden.
const dialog = useDialog({
  // A pinned panel is never a dialog, so it never traps focus or takes it on open.
  isOpen: computed(() => store.open && !props.pinned),
  container: panelRef,
  onClose: () => store.closePanel(),
  // Focus the dialog container (tabindex="-1") rather than the search field, so
  // the modal focus contract still holds (focus enters the dialog, Escape +
  // tab-trapping work) without auto-highlighting the search input on open.
  initialFocus: () => panelRef.value,
})
function onKeydown(event: KeyboardEvent): void {
  if (!props.pinned) dialog.onKeydown(event)
}
const pending = ref<Map<string, () => Promise<unknown> | void>>(new Map())
const applyStatusMsg = ref('')
const applyStatusClass = ref('')

// Every Settings section and item comes from the registry: core registers
// 'app' (./settings/appSettings), each section registers its own (F3). A domain
// section is offered — in the nav and in search — only while it is enabled.
const {
  sections: navSections,
  isSectionOffered,
  offeredSections: visibleSections,
} = useOfferedSettingsSections()
// Only what this app mode offers (SDR Manager-only mode trims App Settings).
const allSettings = getSettingItems().filter(isOfferedInAppMode)

const sectionHeading = computed(() => {
  if (searchQuery.value.trim()) return 'SEARCH RESULTS'
  const section = navSections.find((candidate) => candidate.key === activeSection.value)
  if (!section) return activeSection.value
  return section.key === 'app' ? section.label : section.label + ' SETTINGS'
})

/**
 * Whether a setting belongs to the ONLINE / OFF GRID mode its section shows
 * right now. Rows that don't are hidden with v-show, not removed, so a choice
 * staged in one survives switching the mode away and back.
 */
function isShownInSourceMode(setting: SettingItem): boolean {
  return (
    !setting.sourceMode ||
    shownSettingsSourceMode(setting.section, appStore.connectivityMode) === setting.sourceMode
  )
}

const currentSectionItems = computed(() =>
  allSettings.filter((setting) => setting.section === activeSection.value),
)

// Prepared once: the shared matcher lower-cases each field up front.
const settingRecords = allSettings.map((setting) =>
  createSearchRecord(setting, [
    { name: 'label', text: setting.label, weight: 1 },
    { name: 'desc', text: setting.desc, weight: 1 },
    { name: 'searchTerms', text: setting.searchTerms ?? '', weight: 1 },
    { name: 'sectionLabel', text: setting.sectionLabel, weight: 1 },
  ]),
)

const searchResults = computed<SettingItem[]>(() => {
  const query = searchQuery.value.trim()
  /* v8 ignore start -- searchResults is only read while a search query is active
     (it sits behind v-if="searchQuery.trim()"), so query is never empty here */
  if (!query) return []
  /* v8 ignore stop */
  // Settings order, not relevance order: no ranking, no synonyms.
  return searchRecords(settingRecords, query, { rank: false })
    .map((match) => match.item)
    .filter((setting) => isSectionOffered(setting.section))
})

const anySearchResultShown = computed(() => searchResults.value.some(isShownInSourceMode))

const searchResultGroups = computed(() => {
  const groups: Record<string, { section: string; sectionLabel: string; items: SettingItem[] }> = {}
  const sectionOrder: string[] = []
  searchResults.value.forEach((item) => {
    if (!groups[item.section]) {
      groups[item.section] = { section: item.section, sectionLabel: item.sectionLabel, items: [] }
      sectionOrder.push(item.section)
    }
    groups[item.section].items.push(item)
  })
  return sectionOrder.map((sectionKey) => groups[sectionKey])
})

function selectSection(key: string): void {
  activeSection.value = key
  searchQuery.value = ''
  pending.value.clear()
  // A mode clicked but not applied goes with the rest of the staged changes.
  forgetShownSettingsSourceModes()
  // The store names the section too, so the URL follows it (`/settings/<key>`).
  store.activeSection = key
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
  // Bring the whole running app in line with what was just saved, in place of
  // a page reload: the same apply as boot, then every control, map and store
  // that loads its own setting re-reads it. Settings stays open where it was.
  await refreshSettingsFromBackend()
  showApplyStatus('SAVED', false)
}

// A settings URL picked while the panel is open (`/settings/<key>`) switches to
// it, just as clicking that section in the nav does.
watch(
  () => store.activeSection,
  (section) => {
    if (store.open && section && section !== activeSection.value) selectSection(section)
  },
)

watch(
  () => store.open,
  (isOpen) => {
    if (isOpen) {
      // Focus-in is handled by useDialog; here we only resolve which section opens.
      if (store.activeSection) {
        activeSection.value = store.activeSection
      }
      // Report the section that opened, so the URL names it.
      store.activeSection = activeSection.value
    } else {
      searchQuery.value = ''
      pending.value.clear()
    }
  },
  // Immediate: a settings URL opens the panel before it has mounted.
  { immediate: true },
)
</script>
