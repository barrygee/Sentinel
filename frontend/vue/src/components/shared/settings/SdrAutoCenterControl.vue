<template>
  <div class="ac-wrap">
    <div class="ac-row">
      <span class="ac-label">AUTO-CENTER ON TUNE</span>
      <button
        class="ac-track"
        :class="{ 'is-on': on }"
        role="switch"
        :aria-checked="on"
        aria-label="Toggle auto-center the spectrum and waterfall on the tuned frequency"
        @click="toggle"
      >
        <span class="ac-thumb"></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useSdrStore } from '@/stores/sdr'
import * as settingsApi from '@/services/settingsApi'

// Auto-center toggle for the SDR spectrum/waterfall. Lives in the `sdr`
// settings namespace so it persists in the app config DB like every other
// Settings entry. The sdr store is the live source the waterfall click handler
// and the audio NCO read; we mirror the toggle into it immediately (so the
// behaviour previews live) but defer the DB write to APPLY CHANGES via @stage,
// matching the other Settings toggles.
const sdr = useSdrStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
const on = ref<boolean>(sdr.autoCenterWaterfallOnTune)

// Re-hydrate the sdr store from the DB (store owns the fetch + apply), then
// mirror the result into this control's local `on`. Runs on mount AND when the
// config JSON editor uploads a new config, so the JSON editor, this toggle and
// the live waterfall behaviour stay in sync. (SdrPanel listens for the same
// event so the store also syncs when this control isn't mounted.)
async function syncFromDb(): Promise<void> {
  await sdr.hydrateAutoCenterFromDb()
  on.value = sdr.autoCenterWaterfallOnTune
}

onMounted(() => {
  void syncFromDb()
  document.addEventListener('sentinel:config-uploaded', syncFromDb)
})

onBeforeUnmount(() => {
  document.removeEventListener('sentinel:config-uploaded', syncFromDb)
})

function toggle(): void {
  on.value = !on.value
  // Mirror into the store now (also runs the turn-ON recenter side-effect) so
  // the waterfall reflects it immediately; the DB write is staged for APPLY.
  sdr.setAutoCenterWaterfallOnTune(on.value)
  emit('stage', () => settingsApi.put('sdr', 'autoCenterWaterfallOnTune', on.value))
}
</script>

<style scoped>
.ac-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.ac-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* Uses --sp-text-dim inherited from #settings-panel light-theme scope. */
.ac-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--sp-text-dim, #6b7789);
}
/* Inactive track border #8a95a3 is ~3.3:1 on white — passes WCAG 1.4.11. */
.ac-track {
  position: relative;
  width: 36px;
  height: 18px;
  border-radius: 9px;
  border: 1.5px solid #8a95a3;
  background: #f0f2f5;
  cursor: pointer;
  padding: 0;
  transition:
    background 0.15s,
    border-color 0.15s;
}
@media (prefers-reduced-motion: reduce) {
  .ac-track {
    transition: none;
  }
}
/* Active: bright green fill + dark green border provides shape contrast. */
.ac-track.is-on {
  background: #c8ff00;
  border-color: #4d6800;
}
/* Inactive thumb: #6b7785 is ~3.7:1 on the light track bg — passes 3:1. */
.ac-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #6b7785;
  transition:
    left 0.15s,
    background 0.15s;
}
@media (prefers-reduced-motion: reduce) {
  .ac-thumb {
    transition: none;
  }
}
/* Active thumb: very dark green for contrast against bright green track. */
.ac-track.is-on .ac-thumb {
  background: #2d3a00;
  left: 20px;
}
</style>
