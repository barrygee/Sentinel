<template>
  <form class="sdr-devices-accordion" novalidate @submit.prevent="save">
    <BaseTextField
      ref="ssidInput"
      v-model="draft.ssid"
      label="NETWORK NAME"
      :input-id="ids.ssid"
      :error="errors.ssid ?? ''"
      density="settings"
      layout="inline"
      autocomplete="off"
      spellcheck="false"
    />

    <BaseTextField
      ref="passphraseInput"
      v-model="draft.passphrase"
      label="PASSWORD"
      :input-id="ids.passphrase"
      :hint="state.passphrase_set ? 'Leave blank to keep the current password.' : ''"
      :error="errors.passphrase ?? ''"
      density="settings"
      layout="inline"
      input-type="password"
      autocomplete="new-password"
    />

    <BaseFormField
      v-slot="{ controlId }"
      label="SECURITY"
      :control-id="ids.security"
      density="settings"
      layout="inline"
    >
      <select :id="controlId" v-model="draft.security" class="hotspot-select">
        <option value="wpa2">WPA2</option>
        <option value="wpa3">WPA3 (experimental on Raspberry Pi)</option>
      </select>
    </BaseFormField>

    <BaseFormField
      v-slot="{ controlId }"
      label="BAND"
      :control-id="ids.band"
      density="settings"
      layout="inline"
    >
      <select :id="controlId" v-model="draft.band" class="hotspot-select" @change="onBandChange">
        <option value="bg">2.4 GHz</option>
        <option value="a">5 GHz</option>
      </select>
    </BaseFormField>

    <BaseFormField
      v-slot="{ controlId }"
      label="CHANNEL"
      :control-id="ids.channel"
      density="settings"
      layout="inline"
    >
      <select :id="controlId" v-model.number="draft.channel" class="hotspot-select">
        <option :value="0">Automatic</option>
        <option v-for="channel in channelsForBand(draft.band)" :key="channel" :value="channel">
          Channel {{ channel }}
        </option>
      </select>
    </BaseFormField>

    <BaseFormField
      v-slot="{ controlId }"
      label="INTERFACE"
      :control-id="ids.interface"
      density="settings"
      layout="inline"
    >
      <select :id="controlId" v-model="draft.interface" class="hotspot-select">
        <option :value="null">Automatic</option>
        <option v-for="wireless in apCapableInterfaces" :key="wireless.name" :value="wireless.name">
          {{ wireless.name }}{{ wireless.station_ssid ? ` (on ${wireless.station_ssid})` : '' }}
        </option>
      </select>
    </BaseFormField>

    <BaseTextField
      ref="gatewayInput"
      v-model="draft.gatewayCidr"
      label="ADDRESS"
      :input-id="ids.gateway"
      hint="This machine’s address inside the hotspot. Leave blank for 10.42.0.1/24."
      :error="errors.gateway ?? ''"
      density="settings"
      layout="inline"
      placeholder="10.42.0.1/24"
      autocomplete="off"
      spellcheck="false"
    />

    <label class="hotspot-check">
      <input v-model="draft.hidden" type="checkbox" />
      Hide the network name (devices must type it to join)
    </label>
    <label class="hotspot-check">
      <input v-model="draft.enabled" type="checkbox" />
      Start it now, and whenever this machine starts
    </label>
    <label v-if="draft.enabled && dropsUplink" class="hotspot-check hotspot-check--danger">
      <input v-model="draft.confirmUplinkLoss" type="checkbox" />
      I understand this machine loses its own network connection on {{ chosenInterfaceName }}.
    </label>

    <div class="sdr-devices-form-actions">
      <BaseButton
        type="submit"
        variant="primary"
        class="sdr-devices-btn"
        :disabled="busy || (draft.enabled && dropsUplink && !draft.confirmUplinkLoss)"
      >
        {{ busy ? 'SAVING…' : 'SAVE HOTSPOT' }}
      </BaseButton>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * `HotspotSettingsForm` — this machine's Wi-Fi hotspot: the network it
 * offers, how it is secured, which radio hosts it and the address range.
 *
 * Starting a hotspot on the interface that carries this machine's own network
 * connection cuts it off, so that needs an explicit tick; the API also puts
 * any started change on trial (`HotspotRollbackBanner`). The password is
 * sent only when typed: blank keeps the stored one.
 */
import { computed, nextTick, reactive, ref } from 'vue'
import BaseFormField from '@sentinel/ui/base/BaseFormField.vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type {
  LocalHotspotConfigRequest,
  LocalHotspotState,
  LocalWirelessInterface,
} from '../../api/types'
import {
  channelsForBand,
  validateGatewayCidr,
  validatePassphrase,
  validateSsid,
} from '../../utils/validation'

const props = defineProps<{
  state: LocalHotspotState
  interfaces: LocalWirelessInterface[]
  busy: boolean
}>()
const emit = defineEmits<{ save: [body: LocalHotspotConfigRequest] }>()

const ids = {
  ssid: 'sdr-manager-local-hotspot-ssid',
  passphrase: 'sdr-manager-local-hotspot-passphrase',
  security: 'sdr-manager-local-hotspot-security',
  band: 'sdr-manager-local-hotspot-band',
  channel: 'sdr-manager-local-hotspot-channel',
  interface: 'sdr-manager-local-hotspot-interface',
  gateway: 'sdr-manager-local-hotspot-gateway',
}

const draft = reactive({
  ssid: props.state.ssid ?? '',
  passphrase: '',
  security: props.state.security,
  band: props.state.band,
  channel: props.state.channel,
  interface: props.state.interface,
  gatewayCidr: props.state.gateway_cidr ?? '',
  hidden: props.state.hidden,
  enabled: props.state.enabled,
  confirmUplinkLoss: false,
})
const errors = reactive<{ ssid: string | null; passphrase: string | null; gateway: string | null }>(
  {
    ssid: null,
    passphrase: null,
    gateway: null,
  },
)
const ssidInput = ref<{ focus: () => void } | null>(null)
const passphraseInput = ref<{ focus: () => void } | null>(null)
const gatewayInput = ref<{ focus: () => void } | null>(null)

/** Interfaces that can host a network; `supports_ap` null means unknown, so it is offered. */
const apCapableInterfaces = computed(() =>
  props.interfaces.filter((wireless) => wireless.supports_ap !== false),
)
const chosenInterface = computed(() =>
  props.interfaces.find((wireless) => wireless.name === draft.interface),
)
const chosenInterfaceName = computed(() => draft.interface ?? 'its wireless interface')
/** Whether hosting on the chosen interface takes this machine off its own network. */
const dropsUplink = computed(() =>
  draft.interface === null
    ? props.state.uplink_interface_is_hotspot_interface
    : chosenInterface.value?.carries_default_route === true,
)

function onBandChange(): void {
  // A channel from the other band is never valid; fall back to Automatic.
  if (!channelsForBand(draft.band).includes(draft.channel)) draft.channel = 0
}

async function save(): Promise<void> {
  errors.ssid = validateSsid(draft.ssid)
  const passphraseRequired = !props.state.passphrase_set
  errors.passphrase =
    draft.passphrase === '' && !passphraseRequired ? null : validatePassphrase(draft.passphrase)
  errors.gateway = draft.gatewayCidr.trim() === '' ? null : validateGatewayCidr(draft.gatewayCidr)
  if (errors.ssid || errors.passphrase || errors.gateway) {
    await nextTick()
    const firstInvalid = errors.ssid
      ? ssidInput
      : errors.passphrase
        ? passphraseInput
        : gatewayInput
    firstInvalid.value?.focus()
    return
  }
  const body: LocalHotspotConfigRequest = {
    ssid: draft.ssid,
    security: draft.security,
    hidden: draft.hidden,
    enabled: draft.enabled,
    interface: draft.interface,
    band: draft.band,
    channel: draft.channel,
    gateway_cidr: draft.gatewayCidr.trim() === '' ? null : draft.gatewayCidr.trim(),
    confirm_uplink_loss: draft.confirmUplinkLoss,
  }
  // Omitted, never sent empty: the API reads a missing key as "keep the stored one".
  if (draft.passphrase !== '') body.passphrase = draft.passphrase
  emit('save', body)
  draft.passphrase = ''
}
</script>

<style scoped>
/* The native pickers wear the settings field's hairline look (see
   BaseTextField's settings density), so they sit level with the text fields. */
.hotspot-select {
  width: 100%;
  min-width: 0;
  padding: 6px 0 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: inset 0 -1px 0 var(--settings-field-line);
  color: var(--ink);
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: var(--settings-text-value);
  letter-spacing: 0.04em;
  outline: none;
  transition: box-shadow 0.15s;
}
.hotspot-select:focus {
  box-shadow: inset 0 -2px 0 var(--color-accent);
}
@media (prefers-reduced-motion: reduce) {
  .hotspot-select {
    transition: none;
  }
}

.hotspot-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-height: 24px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
.hotspot-check--danger {
  color: var(--danger);
}
</style>
