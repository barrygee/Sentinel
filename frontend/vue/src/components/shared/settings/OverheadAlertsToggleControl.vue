<template>
  <div class="oa-wrap">
    <div class="oa-row">
      <span class="oa-label">CIVIL</span>
      <BaseToggleSwitch
        :model-value="civil"
        accessible-name="Toggle civil overhead aircraft alerts"
        @update:model-value="toggle('civil')"
      />
    </div>
    <div class="oa-row">
      <span class="oa-label">MIL</span>
      <BaseToggleSwitch
        :model-value="mil"
        accessible-name="Toggle military overhead aircraft alerts"
        @update:model-value="toggle('mil')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAirStore } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'
import BaseToggleSwitch from '@/components/base/BaseToggleSwitch.vue'

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
  gap: 11px;
}
.oa-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.6);
}
</style>
