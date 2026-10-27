<template>
  <form class="sdr-devices-accordion" novalidate @submit.prevent="save">
    <LocalFormField
      v-slot="{ describedBy, invalid }"
      label="NETWORK NAME"
      :field-id="ids.ssid"
      :error="errors.ssid"
    >
      <input
        :id="ids.ssid"
        ref="ssidInput"
        v-model="draft.ssid"
        type="text"
        class="sdr-devices-form-input"
        autocomplete="off"
        spellcheck="false"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </LocalFormField>

    <LocalFormField
      v-slot="{ describedBy, invalid }"
      label="PASSWORD"
      :field-id="ids.passphrase"
      :hint="state.passphrase_set ? 'Leave blank to keep the current password.' : ''"
      :error="errors.passphrase"
    >
      <input
        :id="ids.passphrase"
        ref="passphraseInput"
        v-model="draft.passphrase"
        type="password"
        class="sdr-devices-form-input"
        autocomplete="new-password"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </LocalFormField>

    <LocalFormField label="SECURITY" :field-id="ids.security">
      <select :id="ids.security" v-model="draft.security" class="sdr-devices-form-input">
        <option value="wpa2">WPA2</option>
        <option value="wpa3">WPA3 (experimental on Raspberry Pi)</option>
      </select>
    </LocalFormField>

    <LocalFormField label="BAND" :field-id="ids.band">
      <select
        :id="ids.band"
        v-model="draft.band"
        class="sdr-devices-form-input"
        @change="onBandChange"
      >
        <option value="bg">2.4 GHz</option>
        <option value="a">5 GHz</option>
      </select>
    </LocalFormField>

    <LocalFormField label="CHANNEL" :field-id="ids.channel">
      <select :id="ids.channel" v-model.number="draft.channel" class="sdr-devices-form-input">
        <option :value="0">Automatic</option>
        <option v-for="channel in channelsForBand(draft.band)" :key="channel" :value="channel">
          Channel {{ channel }}
        </option>
      </select>
    </LocalFormField>

    <LocalFormField label="INTERFACE" :field-id="ids.interface">
      <select :id="ids.interface" v-model="draft.interface" class="sdr-devices-form-input">
        <option :value="null">Automatic</option>
        <option v-for="wireless in apCapableInterfaces" :key="wireless.name" :value="wireless.name">
          {{ wireless.name }}{{ wireless.station_ssid ? ` (on ${wireless.station_ssid})` : '' }}
        </option>
      </select>
    </LocalFormField>

    <LocalFormField
      v-slot="{ describedBy, invalid }"
      label="ADDRESS"
      :field-id="ids.gateway"
      hint="This machine’s address inside the hotspot. Leave blank for 10.42.0.1/24."
      :error="errors.gateway"
    >
      <input
        :id="ids.gateway"
        ref="gatewayInput"
        v-model="draft.gatewayCidr"
        type="text"
        class="sdr-devices-form-input"
        placeholder="10.42.0.1/24"
        autocomplete="off"
        spellcheck="false"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </LocalFormField>

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
import LocalFormField from '../shared/LocalFormField.vue'

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
const ssidInput = ref<HTMLInputElement | null>(null)
const passphraseInput = ref<HTMLInputElement | null>(null)
const gatewayInput = ref<HTMLInputElement | null>(null)

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
