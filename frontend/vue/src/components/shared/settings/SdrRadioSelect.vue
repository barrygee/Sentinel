<template>
  <div class="settings-datasource-wrap">
    <div
      class="settings-datasource-row settings-datasource-row--dropdown settings-datasource-row--bare"
    >
      <SettingsDropdown
        :model-value="modelValue"
        :options="dropdownOptions"
        :placeholder="placeholderText"
        :disabled="isLoading || dropdownOptions.length === 0"
        :accessible-name="accessibleName"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
    <p v-if="hint" class="settings-datasource-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * `SdrRadioSelect` — the "which SDR radio" dropdown shared by the settings
 * cards that hand a receiver to a decoder (LAND's Off Grid APRS SDR, SEA's Off Grid AIS SDR).
 *
 * Owns only the radio list: it re-reads the configured radios every few
 * seconds (a radio can be added, disabled or — for a Sentry-mirrored device
 * — become unavailable while the panel is open), offers only enabled,
 * available ones, keeps the *selected* radio listed even when it has been
 * withdrawn (labelled, so the operator can see which receiver was decoding
 * and why nothing arrives), and adds an explicit "off" row once a radio is
 * chosen — the custom dropdown has no empty entry of its own. What choosing
 * a radio *does* is the owning card's business, through `v-model`.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { listRadios, type SdrRadioRecord } from '@/services/sdrRadiosApi'
import SettingsDropdown, { type SettingsDropdownOption } from './SettingsDropdown.vue'

/** How often the list re-reads the configured radios. */
const REFRESH_INTERVAL_MS = 5000

const props = defineProps<{
  /** The chosen radio's id as a string; '' when none is chosen. */
  modelValue: string
  /** Accessible name for the dropdown (icon-less, so it is the only name). */
  accessibleName: string
  /** Label of the explicit "off" row, e.g. "Not set — APRS decode off". */
  offLabel: string
  /** What stops working while the selected radio is withdrawn, for the hint. */
  decodeName: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const radios = ref<SettingsDropdownOption[]>([])
const isLoading = ref(true)
const radioCount = ref(0)
/** True when the *selected* radio is no longer available to decode. */
const withdrawn = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null
/** Set when the control goes away, so the initial load cannot start a timer
 *  after it has gone — `onMounted` awaits its request first. */
let isUnmounted = false

const dropdownOptions = computed<SettingsDropdownOption[]>(() =>
  props.modelValue ? [{ value: '', label: props.offLabel }, ...radios.value] : radios.value,
)

const placeholderText = computed(() => {
  if (isLoading.value) return 'Loading…'
  if (radioCount.value === 0) return 'No radios — add one in SDR settings'
  if (radios.value.length === 0) return 'No enabled radios available'
  return props.offLabel
})

const hint = computed(() => {
  if (withdrawn.value) {
    return `The selected radio is no longer available. ${props.decodeName} cannot run until that is fixed, or pick another.`
  }
  if (isLoading.value || radios.value.length > 0) return ''
  if (radioCount.value === 0) {
    return 'Add a radio under Settings → SDR first; it will appear here.'
  }
  return 'Your radios are all disabled or unavailable. Enable one under Settings → SDR.'
})

/** Whether a radio can be offered as a receiver. */
function isOffered(radio: SdrRadioRecord): boolean {
  return radio.enabled && radio.device_available !== false
}

/** Re-read the configured radios and rebuild the option list. */
async function loadRadios(): Promise<void> {
  withdrawn.value = false
  let records: SdrRadioRecord[]
  try {
    records = await listRadios()
  } catch {
    // Sentinel itself being unreachable is the caller's problem to show; here
    // it just means there is nothing to offer.
    records = []
  }
  radioCount.value = records.length

  const options: SettingsDropdownOption[] = []
  for (const radio of records) {
    const value = String(radio.id)
    const offered = isOffered(radio)
    // A disabled or unavailable radio is not offered — picking one would only
    // fail at the point of starting decode. The one already *selected* stays
    // listed even so, and is labelled: dropping it would silently empty the
    // control and leave no clue which radio was decoding.
    if (!offered && value !== props.modelValue) continue
    if (!offered) withdrawn.value = true
    options.push({
      value,
      label: `${radio.name || `Radio ${radio.id}`}${offered ? '' : ' (unavailable)'}`,
    })
  }
  radios.value = options
}

// A changed selection re-reads the list so a newly chosen radio that has since
// been withdrawn is labelled, and the "off" row appears/disappears with it.
watch(
  () => props.modelValue,
  () => void loadRadios(),
)

onMounted(async () => {
  await loadRadios()
  isLoading.value = false
  if (isUnmounted) return
  refreshTimer = setInterval(() => void loadRadios(), REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  isUnmounted = true
  if (refreshTimer !== null) clearInterval(refreshTimer)
})
</script>

<style scoped>
.settings-datasource-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.7;
}
</style>
