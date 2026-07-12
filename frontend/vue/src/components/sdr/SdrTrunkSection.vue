<template>
  <div class="sdr-radio-section sdr-trunk-section">
    <button
      type="button"
      class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
      :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': expanded }"
      :aria-expanded="expanded"
      aria-controls="sdr-trunk-section-body"
      @click="expanded = !expanded"
    >
      <label class="sdr-field-label sdr-frequency-manager-scanner-title">TRUNK SYSTEM</label>
      <span class="sdr-frequency-manager-accordion-chevron">
        <ChevronIcon />
      </span>
    </button>
    <div v-show="expanded" id="sdr-trunk-section-body">
      <!-- Flat-dark custom dropdown matching the device/step pickers (the
           native <select> didn't match the panel theme). Disabled while
           trunking is active — the map can't change mid-follow. -->
      <div
        ref="mapDropdownRef"
        class="sdr-device-dropdown sdr-trunk-dropdown"
        :class="{
          'sdr-device-dropdown--open': mapMenuOpen,
          'sdr-device-dropdown--loading': trunkEnabled,
        }"
        tabindex="0"
        role="combobox"
        aria-label="Trunk channel map"
        aria-haspopup="listbox"
        aria-controls="sdr-trunk-map-listbox"
        :aria-expanded="mapMenuOpen"
        @click.stop="trunkEnabled ? null : toggleMapMenu()"
        @keydown="onMapDropdownKey"
      >
        <div class="sdr-device-dropdown-selected">
          <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
            mapLabel
          }}</span>
          <span class="sdr-device-dropdown-arrow"></span>
        </div>
      </div>
      <!-- Follow the trunked system's control-channel grants. Enabled
           only once digital decode is running and a channel map is
           chosen (canFollow). -->
      <button
        class="sdr-trunk-follow-btn"
        :class="{ 'sdr-trunk-follow-btn--active': trunkEnabled }"
        type="button"
        :title="trunkEnabled ? 'Stop trunk tracking' : 'Follow trunked system'"
        :aria-pressed="trunkEnabled"
        :disabled="!canFollow && !trunkEnabled"
        @click="emit('toggle-follow')"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M6 1.5V10.5M6 1.5L3 4.5M6 1.5L9 4.5M2 8.5h8"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{{ trunkEnabled ? 'FOLLOWING SYSTEM' : 'FOLLOW SYSTEM' }}</span>
      </button>
      <p v-if="channelMaps.length === 0" class="sdr-trunk-hint">
        Add a channel-map CSV to decoder/channel-maps to enable trunking.
      </p>
      <p v-if="trunkError" class="sdr-trunk-error" role="alert">{{ trunkError }}</p>
    </div>
  </div>

  <!-- Channel-map dropdown menu (teleported so it overlays the side panel) -->
  <Teleport to="body">
    <div
      v-if="mapMenuOpen"
      class="sdr-device-menu sdr-device-menu--open sdr-trunk-menu"
      :style="mapMenuStyle"
      @click.stop
    >
      <div id="sdr-trunk-map-listbox" role="listbox" aria-label="Channel maps">
        <div
          role="option"
          class="sdr-device-menu-item"
          :class="{ 'sdr-device-menu-item--selected': channelMap === '' }"
          :aria-selected="channelMap === ''"
          @click="pickMap('')"
        >
          No channel map
        </div>
        <div
          v-for="name in channelMaps"
          :key="name"
          role="option"
          class="sdr-device-menu-item"
          :class="{ 'sdr-device-menu-item--selected': channelMap === name }"
          :aria-selected="channelMap === name"
          @click="pickMap(name)"
        >
          {{ name }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * SdrTrunkSection — the RADIO tab's TRUNK SYSTEM accordion: the trunk-system
 * channel-map picker (a flat-dark dropdown with its own body-teleported menu)
 * and the FOLLOW SYSTEM button. The parent renders it only while trunk
 * tracking is enabled in Settings AND digital decode is running (the trunk
 * control rides on the decode session), so that gate stays in SdrPanel.
 *
 * This is a pure view. Picking a map writes through the `channelMap` model
 * (the panel's computed setter persists it to the store unchanged); the
 * FOLLOW button emits `toggle-follow` into the panel's toggleTrunk, which
 * owns the trunk_decode WS command and its guards. The `expanded` model stays
 * panel-owned so the panel can collapse the accordion whenever the side panel
 * opens, same as its Scanner/Search siblings.
 *
 * The dropdown owns its dismiss behaviour like the other extracted pickers:
 * outside click, Escape, panel scroll past the open-settle window, and window
 * resize. With this extraction the panel no longer owns any dropdown — its
 * document-level menu listeners are gone. Styling lives in SdrPanel.css
 * (imported globally by SdrPanel.vue).
 */
import { ref, computed } from 'vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useWindowEvent } from '@/composables/useWindowEvent'
import { MENU_OPEN_SETTLE_MS } from './sdrPanelUtils'

/** Whether the accordion body is open (panel-owned so it can collapse it). */
const expanded = defineModel<boolean>('expanded', { required: true })
/** The chosen channel-map filename ('' = none; the panel persists it). */
const channelMap = defineModel<string>('channelMap', { required: true })

const props = defineProps<{
  /** Whether a trunk follow is active (locks the map picker, lights the button). */
  trunkEnabled: boolean
  /** Channel-map filenames offered by the backend. */
  channelMaps: string[]
  /** Whether a follow may start (digital decode running + a map chosen). */
  canFollow: boolean
  /** Backend rejection message for the last trunk_decode request ('' = none). */
  trunkError: string
}>()

const emit = defineEmits<{
  /** The FOLLOW/FOLLOWING SYSTEM button was clicked (parent owns the WS command). */
  (event: 'toggle-follow'): void
}>()

// ── Channel-map dropdown ──────────────────────────────────────────────────────
const mapDropdownRef = ref<HTMLElement | null>(null)
const mapMenuOpen = ref(false)
const mapMenuStyle = ref<Record<string, string>>({})

// Armed at open time; scrolls within the settle window are the browser
// scrolling the focused trigger into view, not the user dismissing the menu.
let openedAtMs = 0

const mapLabel = computed(() => (channelMap.value === '' ? 'No channel map' : channelMap.value))

function positionMapMenu() {
  const el = mapDropdownRef.value
  // The dropdown is rendered (accordion open) before the menu can be toggled,
  // so its ref is always populated here.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  mapMenuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleMapMenu() {
  if (mapMenuOpen.value) {
    closeMapMenu()
    return
  }
  positionMapMenu()
  mapMenuOpen.value = true
  openedAtMs = Date.now()
}

function closeMapMenu() {
  mapMenuOpen.value = false
}

function onMapDropdownKey(keyboardEvent: KeyboardEvent) {
  if (props.trunkEnabled) return
  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
    keyboardEvent.preventDefault()
    toggleMapMenu()
  }
  if (keyboardEvent.key === 'Escape') closeMapMenu()
}

function pickMap(name: string) {
  closeMapMenu()
  channelMap.value = name
}

function closeOnScroll() {
  if (Date.now() - openedAtMs < MENU_OPEN_SETTLE_MS) return
  closeMapMenu()
}

useDocumentEvent('click', closeMapMenu)
// Capture phase so scrolls from the inner side-panel container (a descendant,
// and scroll doesn't bubble) still reach this handler and dismiss the menu.
useDocumentEvent('scroll', closeOnScroll, { capture: true })
useWindowEvent('resize', closeMapMenu)
</script>
