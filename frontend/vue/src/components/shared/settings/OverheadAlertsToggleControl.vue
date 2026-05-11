<template>
  <div class="oa-wrap">
    <div class="oa-row">
      <span class="oa-label oa-label--civil">CIVIL</span>
      <button
        class="oa-track oa-track--civil"
        :class="{ 'is-on': civil }"
        role="switch"
        :aria-checked="civil"
        aria-label="Toggle civil overhead aircraft alerts"
        @click="toggle('civil')"
      ><span class="oa-thumb"></span></button>
    </div>
    <div class="oa-row">
      <span class="oa-label oa-label--mil">MIL</span>
      <button
        class="oa-track oa-track--mil"
        :class="{ 'is-on': mil }"
        role="switch"
        :aria-checked="mil"
        aria-label="Toggle military overhead aircraft alerts"
        @click="toggle('mil')"
      ><span class="oa-thumb"></span></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAirStore } from '@/stores/air'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const civil = ref<boolean>(airStore.overlayStates.overheadAlertsCivil)
const mil   = ref<boolean>(airStore.overlayStates.overheadAlertsMil)

function toggle(kind: 'civil' | 'mil'): void {
  if (kind === 'civil') {
    civil.value = !civil.value
    const next = civil.value
    emit('stage', () => { airStore.setOverlay('overheadAlertsCivil', next) })
  } else {
    mil.value = !mil.value
    const next = mil.value
    emit('stage', () => { airStore.setOverlay('overheadAlertsMil', next) })
  }
}
</script>

<style scoped>
.oa-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oa-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.oa-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  min-width: 44px;
}
.oa-label--civil { color: rgba(0, 170, 255, 0.7); }
.oa-label--mil   { color: rgba(200, 255, 0, 0.7); }
.oa-track {
  position: relative;
  width: 36px;
  height: 18px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, border-color 0.15s;
}
.oa-track--civil.is-on {
  background: rgba(0, 170, 255, 0.2);
  border-color: rgba(0, 170, 255, 0.6);
}
.oa-track--mil.is-on {
  background: rgba(200, 255, 0, 0.2);
  border-color: rgba(200, 255, 0, 0.6);
}
.oa-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  transition: left 0.15s, background 0.15s;
}
.oa-track--civil.is-on .oa-thumb { background: #00aaff; left: 20px; }
.oa-track--mil.is-on   .oa-thumb { background: #c8ff00; left: 20px; }
</style>
