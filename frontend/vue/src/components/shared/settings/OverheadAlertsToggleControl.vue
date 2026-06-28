<template>
  <div class="oa-wrap">
    <div class="oa-row">
      <span class="oa-label">CIVIL</span>
      <button
        class="oa-track oa-track--civil"
        :class="{ 'is-on': civil }"
        role="switch"
        :aria-checked="civil"
        aria-label="Toggle civil overhead aircraft alerts"
        @click="toggle('civil')"
      >
        <span class="oa-thumb"></span>
      </button>
    </div>
    <div class="oa-row">
      <span class="oa-label">MILITARY</span>
      <button
        class="oa-track oa-track--mil"
        :class="{ 'is-on': mil }"
        role="switch"
        :aria-checked="mil"
        aria-label="Toggle military overhead aircraft alerts"
        @click="toggle('mil')"
      >
        <span class="oa-thumb"></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAirStore } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const civil = ref<boolean>(airStore.overlayStates.overheadAlertsCivil)
const mil = ref<boolean>(airStore.overlayStates.overheadAlertsMil)

interface OverheadAlertsConfig {
  civil?: boolean
  mil?: boolean
  radiusNm?: number
}

function readOverhead(data: Record<string, unknown> | null): OverheadAlertsConfig {
  const v = data?.overheadAlerts
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as OverheadAlertsConfig) : {}
}

onMounted(async () => {
  const data = await settingsApi.getNamespace('air')
  const oa = readOverhead(data)
  if (typeof oa.civil === 'boolean' && oa.civil !== civil.value) {
    civil.value = oa.civil
    airStore.setOverlay('overheadAlertsCivil', oa.civil)
  }
  if (typeof oa.mil === 'boolean' && oa.mil !== mil.value) {
    mil.value = oa.mil
    airStore.setOverlay('overheadAlertsMil', oa.mil)
  }
  // Remove legacy flat keys (pre-nesting) so the JSON config has no duplicates.
  if (
    data &&
    ('overheadAlertsCivil' in data ||
      'overheadAlertsMil' in data ||
      'overheadAlertRadiusNm' in data)
  ) {
    if ('overheadAlertsCivil' in data) settingsApi.del('air', 'overheadAlertsCivil')
    if ('overheadAlertsMil' in data) settingsApi.del('air', 'overheadAlertsMil')
    if ('overheadAlertRadiusNm' in data) settingsApi.del('air', 'overheadAlertRadiusNm')
  }
})

function toggle(kind: 'civil' | 'mil'): void {
  if (kind === 'civil') {
    civil.value = !civil.value
  } else {
    mil.value = !mil.value
  }
  const nextCivil = civil.value
  const nextMil = mil.value
  airStore.setOverlay('overheadAlertsCivil', nextCivil)
  airStore.setOverlay('overheadAlertsMil', nextMil)
  emit('stage', () => {
    return settingsApi.put('air', 'overheadAlerts', {
      civil: airStore.overlayStates.overheadAlertsCivil,
      mil: airStore.overlayStates.overheadAlertsMil,
      radiusNm: airStore.overheadAlertRadiusNm,
    })
  })
}
</script>

<style scoped>
.oa-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
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
  color: var(--sp-text-dim, #6b7789);
}
.oa-track {
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
  .oa-track {
    transition: none;
  }
}
/* Civil active: blue fill with dark navy border for shape contrast. */
.oa-track--civil.is-on {
  background: rgba(0, 120, 220, 0.25);
  border-color: #0054b3;
}
/* Mil active: bright green fill with dark green border for shape contrast. */
.oa-track--mil.is-on {
  background: #c8ff00;
  border-color: #4d6800;
}
.oa-thumb {
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
  .oa-thumb {
    transition: none;
  }
}
/* Dark navy thumb contrasts well against the light blue civil track. */
.oa-track--civil.is-on .oa-thumb {
  background: #003380;
  left: 20px;
}
/* Very dark green thumb contrasts against bright green mil track. */
.oa-track--mil.is-on .oa-thumb {
  background: #2d3a00;
  left: 20px;
}
</style>
