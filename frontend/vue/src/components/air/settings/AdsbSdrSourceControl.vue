<template>
  <div class="settings-datasource-wrap">
    <div
      class="settings-datasource-row settings-datasource-row--dropdown settings-datasource-row--bare"
    >
      <SettingsDropdown
        v-model="selected"
        :options="dropdownOptions"
        :placeholder="placeholderText"
        :disabled="isLoading || dropdownOptions.length === 0"
        accessible-name="ADS-B source SDR"
      />
    </div>
    <p v-if="hint" class="settings-datasource-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Picks which Sentry SDR produces the samples behind Off Grid ADS-B.
 *
 * The Off Grid *URL* beside this says where to read decoded aircraft from; this
 * says which dongle produced them. They are separate facts — a decoder can sit
 * anywhere — and until this existed the receiver was anonymous, so Sentinel
 * could neither tune it to 1090 MHz nor stop anything else retuning it. See
 * ADR-0003.
 *
 * Devices come from the Sentry hosts already registered in Settings → SDR, so
 * there is nothing to type: an operator picks the dongle they already named.
 * Staged like every other setting in the panel, and saved by APPLY CHANGES. It
 * used to save the moment it was picked, which left Apply reporting "no
 * changes" right after the operator had changed it — and looked broken.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clearAdsbSource, getAdsbSource, setAdsbSource } from '@/services/adsbSourceApi'
import SettingsDropdown, {
  type SettingsDropdownOption,
} from '@/components/shared/settings/SettingsDropdown.vue'
import { getCapability } from '@/shell/capabilities'
import { useSettingsStore } from '@/stores/settings'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

/** A device option's `value` is `${hostId}:${deviceId}` — the two ids the backend needs, in one. */
const devices = ref<SettingsDropdownOption[]>([])
const selected = ref('')
const isLoading = ref(true)
const hostCount = ref(0)
/** True when the *selected* device is no longer offered by its Sentry. */
const withdrawn = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null
/**
 * Set when the control goes away, so the initial load cannot start a timer
 * after it has gone.
 *
 * `onMounted` awaits two requests before scheduling the refresh, and an unmount
 * during that window runs `onBeforeUnmount` *first* — leaving nothing to clear
 * the interval that is about to be created, and a poller running for the life
 * of the page against a control that no longer exists.
 */
let isUnmounted = false

/**
 * How often the list re-reads Sentry's devices.
 *
 * A device's visibility or enabled state can change from Sentry's own console
 * at any moment, and this list is how an operator decides what to point AIR at
 * — a stale one offers a dongle that has since been withdrawn. Sentinel's fleet
 * poller already refreshes its snapshot every couple of seconds, so this only
 * has to re-read that cached view, not reach the Pi.
 */
const REFRESH_INTERVAL_MS = 5000

/**
 * True while the persisted choice is written into the dropdown, so the model
 * watcher can tell hydration apart from an operator's pick and not re-save what
 * the backend already had.
 */
let isHydrating = false

/**
 * What the dropdown offers: the devices, plus an explicit "unset" row once one
 * is chosen — the custom dropdown has no empty entry of its own.
 */
const dropdownOptions = computed<SettingsDropdownOption[]>(() =>
  selected.value ? [{ value: '', label: 'Not set' }, ...devices.value] : devices.value,
)

const placeholderText = computed(() => {
  if (isLoading.value) return 'Loading…'
  if (hostCount.value === 0) return 'No Sentry hosts — add one in SDR settings'
  if (devices.value.length === 0) return 'No devices published by your Sentry hosts'
  return 'Not set'
})

const hint = computed(() => {
  if (withdrawn.value) {
    return 'The selected SDR is no longer public/enabled on its Sentry. AIR cannot claim it until that is changed, or pick another.'
  }
  if (isLoading.value || devices.value.length > 0) return ''
  if (hostCount.value === 0) {
    return 'Add a Sentry host under Settings → SDR first; its SDRs will appear here.'
  }
  // A Sentry only publishes devices its operator marked public, so an empty
  // list is far more often a visibility toggle than a missing dongle.
  return 'Your Sentry hosts are reachable but publish no SDRs. Check each device is enabled.'
})

/**
 * Build the option list from every enabled host's devices, read through the
 * radio platform's `radioSites` capability (Air never sees the Sentry admin
 * API). With no radio platform registered there is nothing to offer.
 */
async function loadDevices(): Promise<void> {
  withdrawn.value = false
  const fleet = (await getCapability('radioSites')?.listDevices()) ?? { hostCount: 0, hosts: [] }
  hostCount.value = fleet.hostCount

  const options: SettingsDropdownOption[] = []
  for (const host of fleet.hosts) {
    for (const device of host.devices) {
      // Private and disabled devices are not offered as sources. Both are the
      // operator saying on the Sentry side that this dongle is not for
      // sharing or not in service, and picking one here would claim and tune
      // hardware they have withdrawn.
      //
      // The one already *selected* is kept in the list even when withdrawn,
      // and labelled as such. Dropping it would silently empty the control
      // and leave the operator with no clue which dongle AIR was pointed at.
      const value = `${host.id}:${device.deviceId}`
      const isOffered = device.enabled && device.public
      if (!isOffered && value !== selected.value) continue
      if (!isOffered) withdrawn.value = true
      options.push({
        value,
        // Names the host as well as the device: two Pis can each have a
        // dongle called "ADSB", and picking the wrong one would tune a
        // receiver in another room.
        label: `${host.label} — ${device.name}` + (isOffered ? '' : ' (no longer published)'),
      })
    }
  }
  devices.value = options
  isLoading.value = false
}

async function loadSelection(): Promise<void> {
  const source = await getAdsbSource()
  // An unreachable backend leaves the current choice alone rather than
  // blanking the control.
  if (source === null) return
  isHydrating = true
  selected.value =
    source.configured && source.sentry_host_id !== null && source.sentry_device_id
      ? `${source.sentry_host_id}:${source.sentry_device_id}`
      : ''
  isHydrating = false
}

/**
 * Persist the chosen device, or clear it when "Not set" is picked. Run by
 * APPLY CHANGES. Throws when the backend refuses or cannot be reached, so the
 * panel reports ERROR rather than SAVED — the API client returns null on
 * failure instead of throwing.
 */
async function saveSelection(value: string): Promise<void> {
  if (!value) {
    if ((await clearAdsbSource()) === null) throw new Error('Could not clear the ADS-B source')
    return
  }
  // `device_id` itself contains a colon ("serial:ABC"), so split once only.
  const separator = value.indexOf(':')
  const hostId = Number(value.slice(0, separator))
  const deviceId = value.slice(separator + 1)
  /* v8 ignore start -- defensive: every option value is built from a numeric
     host id and a non-empty device id in loadDevices, so this cannot trip from
     the UI; it guards a hand-edited stored setting. */
  if (!Number.isFinite(hostId) || !deviceId) return
  /* v8 ignore stop */
  if ((await setAdsbSource(hostId, deviceId)) === null) {
    throw new Error('Could not save the ADS-B source')
  }
}

// Watched rather than handled on a change event: the dropdown is a listbox, so
// its model is the only signal that the operator picked something.
watch(
  selected,
  (value) => {
    if (isHydrating) return
    emit('stage', () => saveSelection(value))
  },
  // Synchronous so the `isHydrating` flag still stands when the watcher runs:
  // the default pre-flush would fire after hydration had already cleared it,
  // and the restored choice would be treated as an operator's pick.
  { flush: 'sync' },
)

// The panel stays mounted while closed, so a pick that was never applied would
// still be showing next time it opens. Re-read the saved choice on each open,
// as the panel drops unapplied changes then too.
const settingsStore = useSettingsStore()
watch(
  () => settingsStore.open,
  (isOpen) => {
    if (isOpen) void loadSelection()
  },
)

onMounted(async () => {
  // Selection first: `loadDevices` needs it to know which withdrawn device to
  // keep listed rather than silently dropping the operator's choice.
  await loadSelection()
  await loadDevices()
  isLoading.value = false
  if (isUnmounted) return
  refreshTimer = setInterval(() => {
    void loadDevices()
  }, REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  isUnmounted = true
  if (refreshTimer !== null) clearInterval(refreshTimer)
})
</script>

<style scoped>
.settings-datasource-hint {
  margin: 6px 0 0;
  font-size: var(--settings-text-small);
  line-height: 1.5;
  opacity: 0.7;
}
</style>
