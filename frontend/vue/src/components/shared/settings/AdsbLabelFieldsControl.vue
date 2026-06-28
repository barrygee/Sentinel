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
          <label class="adsb-lf-check">
            <input
              type="checkbox"
              class="adsb-lf-input"
              :aria-label="`${opt.label} — civil`"
              :checked="fields.civil.includes(opt.value)"
              @change="toggle('civil', opt.value)"
            />
            <span class="adsb-lf-box">
              <svg
                v-if="fields.civil.includes(opt.value)"
                width="8"
                height="5"
                viewBox="0 0 8 5"
                fill="none"
              >
                <path
                  d="M1 2.5L3 4.5L7 0.5"
                  stroke="#0066b3"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </label>
        </div>
        <div class="adsb-lf-cell">
          <label class="adsb-lf-check">
            <input
              type="checkbox"
              class="adsb-lf-input"
              :aria-label="`${opt.label} — military`"
              :checked="fields.mil.includes(opt.value)"
              @change="toggle('mil', opt.value)"
            />
            <span class="adsb-lf-box adsb-lf-box--mil">
              <svg
                v-if="fields.mil.includes(opt.value)"
                width="8"
                height="5"
                viewBox="0 0 8 5"
                fill="none"
              >
                <path
                  d="M1 2.5L3 4.5L7 0.5"
                  stroke="#4d6800"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAirStore, type AdsbLabelField, type AdsbLabelFields } from '@/stores/air'

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
  emit('stage', () => {})
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
  border: 1px solid var(--sp-border, #d8dce4);
  border-radius: 3px;
  overflow: hidden;
  width: fit-content;
  min-width: 360px;
}
.adsb-lf-header {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  background: var(--sp-code-bg, #f0f2f5);
  border-bottom: 1px solid var(--sp-border, #d8dce4);
}
.adsb-lf-header-field,
.adsb-lf-header-col {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 7px 16px;
  color: var(--sp-text-dim, #6b7789);
}
.adsb-lf-header-col {
  text-align: center;
  padding-left: 0;
  padding-right: 0;
}
/* Civil blue header: #0066b3 is ~4.6:1 on white — passes AA. */
.adsb-lf-header-col--civil {
  color: #0066b3;
}
/* Mil green header: #4d6800 is ~6.4:1 on white — passes AA. */
.adsb-lf-header-col--mil {
  color: var(--sp-accent-text, #4d6800);
}
.adsb-lf-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  align-items: center;
  border-bottom: 1px solid var(--sp-border-subtle, #e8eaee);
  background: var(--sp-surface, #fff);
  transition: background 0.1s;
}
@media (prefers-reduced-motion: reduce) {
  .adsb-lf-row {
    transition: none;
  }
}
.adsb-lf-row:last-child {
  border-bottom: none;
}
.adsb-lf-row:hover {
  background: var(--sp-code-bg, #f0f2f5);
}
.adsb-lf-row-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
}
.adsb-lf-row-name {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sp-text-muted, #3d4a5c);
}
.adsb-lf-preview {
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 2px;
}
/* Light civil chip: dark blue text on a pale blue tint. */
.adsb-lf-preview--civil {
  background: rgba(0, 102, 179, 0.1);
  color: #0066b3;
}
/* Light mil chip: dark green text on a pale green tint. */
.adsb-lf-preview--mil {
  background: rgba(77, 104, 0, 0.1);
  color: var(--sp-accent-text, #4d6800);
}
/* Altitude chip: neutral muted style on light backgrounds. */
.adsb-lf-preview--alt {
  background: var(--sp-code-bg, #f0f2f5);
  color: var(--sp-text-dim, #6b7789);
}
.adsb-lf-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
}
.adsb-lf-check {
  cursor: pointer;
  display: flex;
  align-items: center;
}
.adsb-lf-input {
  display: none;
}
.adsb-lf-box {
  width: 14px;
  height: 14px;
  border: 1px solid #8a95a3;
  border-radius: 2px;
  background: var(--sp-surface, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.15s,
    background 0.15s;
}
@media (prefers-reduced-motion: reduce) {
  .adsb-lf-box {
    transition: none;
  }
}
.adsb-lf-input:checked + .adsb-lf-box {
  background: rgba(0, 102, 179, 0.1);
  border-color: #0066b3;
}
.adsb-lf-input:checked + .adsb-lf-box--mil {
  background: rgba(77, 104, 0, 0.1);
  border-color: var(--sp-accent-text, #4d6800);
}

@media (max-width: 480px) {
  .adsb-lf-table {
    width: 100%;
    min-width: 0;
  }
  .adsb-lf-header,
  .adsb-lf-row {
    grid-template-columns: 1fr 56px 56px;
  }
  .adsb-lf-header-field,
  .adsb-lf-header-col {
    padding: 7px 8px;
    font-size: 8px;
    letter-spacing: 0.14em;
  }
}
</style>
