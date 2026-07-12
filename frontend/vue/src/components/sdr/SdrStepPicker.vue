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
 * own body-teleported options menu (so it overlays the side panel); the menu
 * state, positioning and dismiss behaviour (outside click, settle-window
 * scroll, resize) come from useTeleportedMenu.
 *
 * v-model is the step in kHz as a string (the panel stores steps as strings
 * and converts to Hz at save/tune time).
 *
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref, computed } from 'vue'
import { useTeleportedMenu } from '@/composables/useTeleportedMenu'

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
const { menuOpen, menuStyle, toggleMenu: toggleTeleportedMenu, closeMenu } = useTeleportedMenu()

const selectedLabel = computed(() => {
  const v = parseFloat(stepKhz.value)
  // The step is always chosen from the dropdown's positive STEP_OPTIONS (and
  // seeded valid), so the placeholder fallback is never reached.
  /* v8 ignore start */
  if (!isFinite(v) || v <= 0) return '— select step —'
  /* v8 ignore stop */
  return formatStepKhz(v)
})

function toggleMenu() {
  toggleTeleportedMenu(triggerRef.value)
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
</script>
