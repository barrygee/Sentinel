<template>
  <div
    ref="triggerRef"
    class="sdr-device-dropdown sdr-step-dropdown"
    :class="{
      'sdr-device-dropdown--open': menuOpen,
      'sdr-device-dropdown--loading': disabled,
    }"
    tabindex="0"
    @click.stop="disabled ? null : toggleMenu()"
    @keydown="onTriggerKey"
  >
    <div class="sdr-device-dropdown-selected">
      <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
        selectedLabel
      }}</span>
      <span class="sdr-device-dropdown-arrow"></span>
    </div>
  </div>
  <!-- Options menu (teleported so it overlays the side panel) -->
  <Teleport to="body">
    <div
      v-if="menuOpen"
      class="sdr-device-menu sdr-device-menu--open sdr-step-menu"
      :style="menuStyle"
      @click.stop
    >
      <div
        v-for="s in STEP_OPTIONS_KHZ"
        :key="s"
        class="sdr-device-menu-item"
        :class="{ 'sdr-device-menu-item--selected': parseFloat(stepKhz) === s }"
        @click="pickStep(s)"
      >
        {{ formatStepKhz(s) }}
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * SdrStepPicker — the channel-step dropdown used by the SDR panel's ad-hoc
 * search bar and the search-range editor forms. Renders the trigger plus its
 * own body-teleported options menu (so it overlays the side panel), and owns
 * the full dismiss behaviour: outside click, Escape, panel scroll (with the
 * open-settle window — see MENU_OPEN_SETTLE_MS) and window resize.
 *
 * v-model is the step in kHz as a string (the panel stores steps as strings
 * and converts to Hz at save/tune time).
 *
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref, computed } from 'vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useWindowEvent } from '@/composables/useWindowEvent'
import { MENU_OPEN_SETTLE_MS } from './sdrPanelUtils'

const stepKhz = defineModel<string>({ required: true })

defineProps<{
  /**
   * Renders the trigger in its loading/disabled style and ignores clicks.
   * Deliberately does NOT gate the keyboard handler — the pre-extraction
   * ad-hoc dropdown only gated its click handler, and this preserves that
   * behaviour exactly.
   */
  disabled?: boolean
}>()

// Common channel step sizes (kHz) used by scanners / SDR apps. Covers HF fine
// tuning (0.1–2.5), HF/CB (5), digital voice (6.25), 8.33 air band (EU),
// 9 kHz MW (EU/AS), 10 kHz MW (US), 12.5 NFM PMR/marine, 25 NFM, and FM
// broadcast (100/200).
const STEP_OPTIONS_KHZ = [
  0.1, 0.25, 0.5, 1, 2.5, 5, 6.25, 7.5, 8.33, 9, 10, 12.5, 15, 20, 25, 30, 50, 100, 200,
] as const

function formatStepKhz(v: number): string {
  return `${v} kHz`
}

const triggerRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuStyle = ref<Record<string, string>>({})

// Armed at open time; scrolls within the settle window are the browser
// scrolling the focused trigger into view, not the user dismissing the menu.
let openedAtMs = 0

const selectedLabel = computed(() => {
  const v = parseFloat(stepKhz.value)
  // The step is always chosen from the dropdown's positive STEP_OPTIONS (and
  // seeded valid), so the placeholder fallback is never reached.
  /* v8 ignore start */
  if (!isFinite(v) || v <= 0) return '— select step —'
  /* v8 ignore stop */
  return formatStepKhz(v)
})

function positionMenu() {
  const el = triggerRef.value
  // The trigger is rendered before the menu can be toggled, so its ref is
  // always populated here.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  menuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleMenu() {
  if (menuOpen.value) {
    closeMenu()
    return
  }
  positionMenu()
  menuOpen.value = true
  openedAtMs = Date.now()
}

function closeMenu() {
  menuOpen.value = false
}

function onTriggerKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleMenu()
  }
  if (e.key === 'Escape') closeMenu()
}

function pickStep(v: number) {
  closeMenu()
  stepKhz.value = v.toString()
}

// The menu is teleported to <body> at position: fixed, anchored once at open
// time from the trigger's bounding rect. Match native <select> behaviour and
// dismiss it on outside click, panel scroll (past the settle window — the
// browser fires one settle scroll right after open when it scrolls the
// focused trigger into view) and window resize.
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
