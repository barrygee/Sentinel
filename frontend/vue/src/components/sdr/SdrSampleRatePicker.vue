<template>
  <!-- Custom dropdown (NOT native <select>): native option lists are
       UA-rendered and can't be themed; reuse the app's flat-dark
       device-dropdown primitives instead. -->
  <div
    class="sdr-device-dropdown sdr-ef-setting-dropdown"
    :class="{ 'sdr-device-dropdown--open': menuOpen }"
    tabindex="0"
    role="button"
    aria-haspopup="listbox"
    :aria-expanded="menuOpen"
    aria-label="Device sample rate"
    @click.stop="toggleMenu($event)"
    @keydown="onTriggerKey"
  >
    <div class="sdr-device-dropdown-selected">
      <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
        formatBwHz(sampleRateHz)
      }}</span>
      <span class="sdr-device-dropdown-arrow"></span>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="menuOpen"
      class="sdr-device-menu sdr-device-menu--open"
      role="listbox"
      aria-label="Device sample rate options"
      :style="menuStyle"
      @click.stop
    >
      <div
        v-for="rate in SAMPLE_RATE_OPTIONS"
        :key="rate"
        class="sdr-device-menu-item"
        :class="{ 'sdr-device-menu-item--selected': rate === sampleRateHz }"
        role="option"
        :aria-selected="rate === sampleRateHz"
        @click="pickRate(rate)"
      >
        {{ formatBwHz(rate) }}
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * SdrSampleRatePicker — the SAMPLE RATE dropdown used by the frequency-manager
 * add/edit forms' RADIO SETTINGS grid. It edits a *stored* frequency's sample
 * rate (a plain v-model number), not the connected device — the RADIO tab's
 * live sample-rate dropdown stays in SdrPanel because picking there sends a
 * hardware command.
 *
 * Follows the SdrStepPicker pattern: renders the trigger plus its own
 * body-teleported listbox menu (so it overlays the side panel) and owns the
 * full dismiss behaviour — outside click, Escape, panel scroll past the
 * open-settle window, and window resize.
 *
 * The menu is positioned from the triggering event's currentTarget rather
 * than a template ref: the per-row edit form lives inside a v-for, where Vue
 * would make a template ref an *array* of elements, so currentTarget is the
 * reliable handle.
 *
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref } from 'vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useWindowEvent } from '@/composables/useWindowEvent'
import { formatBwHz, MENU_OPEN_SETTLE_MS, SAMPLE_RATE_OPTIONS } from './sdrPanelUtils'

const sampleRateHz = defineModel<number>({ required: true })

const menuOpen = ref(false)
const menuStyle = ref<Record<string, string>>({})

// Armed at open time; scrolls within the settle window are the browser
// scrolling the focused trigger into view, not the user dismissing the menu.
let openedAtMs = 0

function positionMenu(dropdownEl: HTMLElement) {
  const rect = dropdownEl.getBoundingClientRect()
  menuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleMenu(event: MouseEvent | KeyboardEvent) {
  if (menuOpen.value) {
    closeMenu()
    return
  }
  positionMenu(event.currentTarget as HTMLElement)
  menuOpen.value = true
  openedAtMs = Date.now()
}

function closeMenu() {
  menuOpen.value = false
}

function onTriggerKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleMenu(event)
  }
  if (event.key === 'Escape') closeMenu()
}

function pickRate(rate: number) {
  closeMenu()
  // The menu only ever offers SAMPLE_RATE_OPTIONS values.
  /* v8 ignore start */
  if (!SAMPLE_RATE_OPTIONS.includes(rate as (typeof SAMPLE_RATE_OPTIONS)[number])) return
  /* v8 ignore stop */
  sampleRateHz.value = rate
}

function closeOnScroll() {
  if (Date.now() - openedAtMs < MENU_OPEN_SETTLE_MS) return
  closeMenu()
}

useDocumentEvent('click', closeMenu)
// Capture phase so scrolls from the inner side-panel container (a descendant,
// and scroll doesn't bubble) still reach this handler and dismiss the menu.
useDocumentEvent('scroll', closeOnScroll, { capture: true })
useWindowEvent('resize', closeMenu)
</script>
