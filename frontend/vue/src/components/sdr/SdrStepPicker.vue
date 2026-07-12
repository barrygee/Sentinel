<template>
  <BaseSelectMenu
    ref="selectMenuRef"
    class="sdr-step-dropdown"
    :loading="disabled"
    :disabled="disabled"
    custom-keyboard
    menu-class="sdr-step-menu"
    @trigger-keydown="onTriggerKey"
  >
    <template #selected>
      <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
        selectedLabel
      }}</span>
    </template>
    <template #options>
      <div
        v-for="stepOption in STEP_OPTIONS_KHZ"
        :key="stepOption"
        class="sdr-device-menu-item"
        :class="{ 'sdr-device-menu-item--selected': parseFloat(stepKhz) === stepOption }"
        @click="pickStep(stepOption)"
      >
        {{ formatStepKhz(stepOption) }}
      </div>
    </template>
  </BaseSelectMenu>
</template>

<script setup lang="ts">
/**
 * SdrStepPicker — the channel-step dropdown used by the SDR panel's ad-hoc
 * search bar and the search-range editor forms. The trigger + body-teleported
 * options menu (and its dismiss behaviour: outside click, settle-window
 * scroll, resize) come from BaseSelectMenu; this component keeps the step
 * option model and rows.
 *
 * v-model is the step in kHz as a string (the panel stores steps as strings
 * and converts to Hz at save/tune time).
 *
 * The keyboard model is custom because `disabled` deliberately does NOT gate
 * it — the pre-extraction ad-hoc dropdown only gated its click handler, and
 * this preserves that behaviour exactly.
 *
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref, computed } from 'vue'
import BaseSelectMenu from '@/components/base/BaseSelectMenu.vue'

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

const selectMenuRef = ref<InstanceType<typeof BaseSelectMenu> | null>(null)

const selectedLabel = computed(() => {
  const v = parseFloat(stepKhz.value)
  // The step is always chosen from the dropdown's positive STEP_OPTIONS (and
  // seeded valid), so the placeholder fallback is never reached.
  /* v8 ignore start */
  if (!isFinite(v) || v <= 0) return '— select step —'
  /* v8 ignore stop */
  return formatStepKhz(v)
})

function onTriggerKey(e: KeyboardEvent) {
  // The trigger only fires events once mounted, so the ref is always set.
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    selectMenuRef.value!.toggleMenu()
  }
  if (e.key === 'Escape') selectMenuRef.value!.closeMenu()
}

function pickStep(v: number) {
  selectMenuRef.value!.closeMenu()
  stepKhz.value = v.toString()
}
</script>
