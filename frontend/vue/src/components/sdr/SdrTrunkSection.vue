<template>
  <div class="sdr-radio-section sdr-trunk-section">
    <BaseAccordionSection
      v-model:expanded="expanded"
      title="TRUNK SYSTEM"
      body-id="sdr-trunk-section-body"
    >
      <!-- Flat-dark custom dropdown matching the device/step pickers (the
           native <select> didn't match the panel theme). Disabled while
           trunking is active — the map can't change mid-follow. -->
      <BaseSelectMenu
        ref="mapMenuRef"
        class="sdr-trunk-dropdown"
        :loading="trunkEnabled"
        :disabled="trunkEnabled"
        trigger-role="combobox"
        aria-label="Trunk channel map"
        aria-controls="sdr-trunk-map-listbox"
        custom-keyboard
        menu-class="sdr-trunk-menu"
        @trigger-keydown="onMapDropdownKey"
      >
        <template #selected>
          <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
            mapLabel
          }}</span>
        </template>
        <template #options>
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
        </template>
      </BaseSelectMenu>
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
    </BaseAccordionSection>
  </div>
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
 * The dropdown's trigger, teleported menu and dismiss behaviour (outside
 * click, settle-window scroll, resize) come from BaseSelectMenu; the keyboard
 * model is custom because trunkEnabled gates the whole handler (including
 * Escape), matching the pre-extraction dropdown exactly. The TRUNK SYSTEM
 * header + collapsible body come from BaseAccordionSection. Styling lives in
 * SdrPanel.css (imported globally by SdrPanel.vue).
 */
import { ref, computed } from 'vue'
import BaseAccordionSection from '@/components/base/BaseAccordionSection.vue'
import BaseSelectMenu from '@/components/base/BaseSelectMenu.vue'

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
const mapMenuRef = ref<InstanceType<typeof BaseSelectMenu> | null>(null)

const mapLabel = computed(() => (channelMap.value === '' ? 'No channel map' : channelMap.value))

function onMapDropdownKey(keyboardEvent: KeyboardEvent) {
  // The trigger only fires events once mounted, so the ref is always set.
  if (props.trunkEnabled) return
  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
    keyboardEvent.preventDefault()
    mapMenuRef.value!.toggleMenu()
  }
  if (keyboardEvent.key === 'Escape') mapMenuRef.value!.closeMenu()
}

function pickMap(name: string) {
  mapMenuRef.value!.closeMenu()
  channelMap.value = name
}
</script>
