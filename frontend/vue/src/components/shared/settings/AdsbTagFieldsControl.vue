<template>
  <div class="adsb-tf-wrap">
    <div class="adsb-tf-table">
      <div class="adsb-tf-header">
        <div class="adsb-tf-header-field">Field</div>
        <div class="adsb-tf-header-col adsb-tf-header-col--civil">Civil</div>
        <div class="adsb-tf-header-col adsb-tf-header-col--mil">Mil</div>
      </div>
      <div v-for="opt in OPTIONS" :key="opt.key" class="adsb-tf-row">
        <div class="adsb-tf-row-label">
          <span class="adsb-tf-row-abbr">{{ opt.abbr }}</span>
          <span class="adsb-tf-row-name">{{ opt.label }}</span>
        </div>
        <div class="adsb-tf-cell">
          <BaseCheckbox
            class="adsb-tf-check"
            input-class="adsb-tf-input"
            box-class="adsb-tf-box"
            :accessible-name="`${opt.label} — civil`"
            :checked="fields.civil[opt.key]"
            @change="toggle('civil', opt.key)"
          >
            <template #checkmark>
              <svg v-if="fields.civil[opt.key]" width="8" height="5" viewBox="0 0 8 5" fill="none">
                <path
                  d="M1 2.5L3 4.5L7 0.5"
                  stroke="#0a0c10"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </template>
          </BaseCheckbox>
        </div>
        <div class="adsb-tf-cell">
          <BaseCheckbox
            class="adsb-tf-check"
            input-class="adsb-tf-input"
            box-class="adsb-tf-box adsb-tf-box--mil"
            :accessible-name="`${opt.label} — military`"
            :checked="fields.mil[opt.key]"
            @change="toggle('mil', opt.key)"
          >
            <template #checkmark>
              <svg v-if="fields.mil[opt.key]" width="8" height="5" viewBox="0 0 8 5" fill="none">
                <path
                  d="M1 2.5L3 4.5L7 0.5"
                  stroke="#0a0c10"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </template>
          </BaseCheckbox>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import { useAirStore, type AdsbTagFields, type AdsbTagFieldMap } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

const fields = ref<AdsbTagFields>({
  civil: { ...airStore.adsbTagFields.civil },
  mil: { ...airStore.adsbTagFields.mil },
})

const OPTIONS: Array<{ key: keyof AdsbTagFieldMap; abbr: string; label: string }> = [
  { key: 'callsign', abbr: 'CSS', label: 'Callsign' },
  { key: 'altitude', abbr: 'ALT', label: 'Altitude' },
  { key: 'speed', abbr: 'SPD', label: 'Speed' },
  { key: 'heading', abbr: 'HDG', label: 'Heading' },
  { key: 'aircraftType', abbr: 'TYP', label: 'Aircraft Type' },
  { key: 'registration', abbr: 'REG', label: 'Registration' },
  { key: 'squawk', abbr: 'SQK', label: 'Squawk' },
  { key: 'category', abbr: 'CAT', label: 'Category' },
]

onMounted(async () => {
  const data = await settingsApi.getNamespace('air')
  const remote = data?.labelDataPoints as AdsbTagFields | undefined
  if (
    remote &&
    typeof remote === 'object' &&
    !Array.isArray(remote) &&
    typeof remote.civil === 'object' &&
    typeof remote.mil === 'object'
  ) {
    fields.value = {
      civil: { ...airStore.adsbTagFields.civil, ...remote.civil },
      mil: { ...airStore.adsbTagFields.mil, ...remote.mil },
    }
    airStore.setAdsbTagFields({ ...fields.value })
    window.dispatchEvent(new CustomEvent('adsb:tagFieldsChanged', { detail: { ...fields.value } }))
  }
})

function toggle(group: 'civil' | 'mil', key: keyof AdsbTagFieldMap): void {
  fields.value = {
    ...fields.value,
    [group]: { ...fields.value[group], [key]: !fields.value[group][key] },
  }
  airStore.setAdsbTagFields({ ...fields.value })
  window.dispatchEvent(new CustomEvent('adsb:tagFieldsChanged', { detail: { ...fields.value } }))
  emit('stage', () => {
    settingsApi.put('air', 'labelDataPoints', { ...fields.value })
  })
}
</script>

<style scoped>
.adsb-tf-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.adsb-tf-table {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.adsb-tf-header {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  padding: 0 4px 10px;
}
.adsb-tf-header-field,
.adsb-tf-header-col {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.38);
}
.adsb-tf-header-field {
  padding-left: 10px;
}
.adsb-tf-header-col {
  text-align: center;
}
.adsb-tf-header-col--civil {
  color: rgba(16, 19, 29, 0.38);
}
.adsb-tf-header-col--mil {
  color: rgba(16, 19, 29, 0.38);
}
.adsb-tf-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  align-items: center;
  background: rgba(16, 19, 29, 0.015);
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background 0.1s;
}
.adsb-tf-row:hover {
  background: rgba(16, 19, 29, 0.04);
}
.adsb-tf-row-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
}
.adsb-tf-row-abbr {
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: rgba(16, 19, 29, 0.4);
  min-width: 28px;
}
.adsb-tf-row-name {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.82);
}
.adsb-tf-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 0;
}
.adsb-tf-check {
  cursor: pointer;
  display: flex;
  align-items: center;
}
/* The input/box render inside BaseCheckbox (which owns hiding the input), so
   only the label root carries this component's scope id — their rules need
   :deep() anchored at the label class. */
.adsb-tf-check :deep(.adsb-tf-box) {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 0;
  background: rgba(16, 19, 29, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.adsb-tf-check :deep(.adsb-tf-input:checked + .adsb-tf-box) {
  background: #c8ff00;
}
.adsb-tf-check :deep(.adsb-tf-input:checked + .adsb-tf-box--mil) {
  background: #c8ff00;
}
</style>
