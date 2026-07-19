<template>
  <div class="adsb-lf-wrap">
    <div class="adsb-lf-table">
      <!-- Header -->
      <div class="adsb-lf-header">
        <div class="adsb-lf-header-field">Field</div>
        <div class="adsb-lf-header-col adsb-lf-header-col--civil">Civil</div>
        <div class="adsb-lf-header-col adsb-lf-header-col--mil">Military</div>
      </div>
      <!-- Rows -->
      <div v-for="opt in OPTIONS" :key="opt.value" class="adsb-lf-row">
        <div class="adsb-lf-row-label">
          <span class="adsb-lf-row-name">{{ opt.label }}</span>
          <span v-if="opt.value === 'type'" class="adsb-lf-preview adsb-lf-preview--civil"
            >B738</span
          >
          <span v-if="opt.value === 'type'" class="adsb-lf-preview adsb-lf-preview--mil">F-16</span>
          <span v-if="opt.value === 'alt'" class="adsb-lf-preview adsb-lf-preview--alt">FL350</span>
        </div>
        <div class="adsb-lf-cell">
          <BaseCheckbox
            class="adsb-lf-check"
            input-class="adsb-lf-input"
            box-class="adsb-lf-box"
            :accessible-name="`${opt.label} — civil`"
            :checked="fields.civil.includes(opt.value)"
            @change="toggle('civil', opt.value)"
          >
            <template #checkmark>
              <svg
                v-if="fields.civil.includes(opt.value)"
                width="8"
                height="5"
                viewBox="0 0 8 5"
                fill="none"
              >
                <path
                  d="M1 2.5L3 4.5L7 0.5"
                  stroke="#ffffff"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </template>
          </BaseCheckbox>
        </div>
        <div class="adsb-lf-cell">
          <BaseCheckbox
            class="adsb-lf-check"
            input-class="adsb-lf-input"
            box-class="adsb-lf-box adsb-lf-box--mil"
            :accessible-name="`${opt.label} — military`"
            :checked="fields.mil.includes(opt.value)"
            @change="toggle('mil', opt.value)"
          >
            <template #checkmark>
              <svg
                v-if="fields.mil.includes(opt.value)"
                width="8"
                height="5"
                viewBox="0 0 8 5"
                fill="none"
              >
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
import { ref } from 'vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import { useAirStore, type AdsbLabelField, type AdsbLabelFields } from '@/stores/air'
import * as settingsApi from '@/services/settingsApi'

const airStore = useAirStore()
const emit = defineEmits<{ stage: [fn: () => void] }>()

const fields = ref<AdsbLabelFields>({
  civil: [...airStore.adsbLabelFields.civil],
  mil: [...airStore.adsbLabelFields.mil],
})

const OPTIONS: Array<{ value: AdsbLabelField; label: string }> = [
  { value: 'type', label: 'Aircraft Type' },
  { value: 'alt', label: 'Altitude' },
]

function toggle(group: 'civil' | 'mil', field: AdsbLabelField): void {
  const current = fields.value[group]
  const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field]
  fields.value = { ...fields.value, [group]: next }
  airStore.setAdsbLabelFields({ ...fields.value })
  window.dispatchEvent(new CustomEvent('adsb:labelFieldsChanged', { detail: { ...fields.value } }))
  // Persist to the backend (not just localStorage) so the field choice follows
  // the user across devices. See main.ts for the matching startup hydrate.
  emit('stage', () => {
    settingsApi.put('air', 'labelFields', { ...fields.value })
  })
}
</script>

<style scoped>
.adsb-lf-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.adsb-lf-table {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.adsb-lf-header {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  padding: 0 4px 10px;
}
.adsb-lf-header-field,
.adsb-lf-header-col {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.38);
}
.adsb-lf-header-field {
  padding-left: 10px;
}
.adsb-lf-header-col {
  text-align: center;
}
.adsb-lf-header-col--civil {
  color: #1f8fd0;
}
.adsb-lf-header-col--mil {
  color: #5a8a00;
}
.adsb-lf-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  align-items: center;
  background: rgba(16, 19, 29, 0.015);
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background 0.1s;
}
.adsb-lf-row:hover {
  background: rgba(16, 19, 29, 0.04);
}
.adsb-lf-row-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
}
.adsb-lf-row-name {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.82);
}
.adsb-lf-preview {
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 2px;
}
.adsb-lf-preview--civil {
  background: #002244;
  color: #00aaff;
}
.adsb-lf-preview--mil {
  background: #4d6600;
  color: #c8ff00;
}
.adsb-lf-preview--alt {
  background: rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.45);
}
.adsb-lf-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 0;
}
.adsb-lf-check {
  cursor: pointer;
  display: flex;
  align-items: center;
}
/* The input/box render inside BaseCheckbox (which owns hiding the input), so
   only the label root carries this component's scope id — their rules need
   :deep() anchored at the label class. */
.adsb-lf-check :deep(.adsb-lf-box) {
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
.adsb-lf-check :deep(.adsb-lf-input:checked + .adsb-lf-box) {
  background: #00aaff;
}
.adsb-lf-check :deep(.adsb-lf-input:checked + .adsb-lf-box--mil) {
  background: #c8ff00;
}

@media (max-width: 480px) {
  .adsb-lf-header,
  .adsb-lf-row {
    grid-template-columns: 1fr 56px 56px;
  }
  .adsb-lf-header-field,
  .adsb-lf-header-col {
    font-size: 8px;
    letter-spacing: 0.14em;
  }
}
</style>
