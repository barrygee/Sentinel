<template>
  <div class="sdr-devices-accordion">
    <!-- This machine's row is linked by sdr-manager-remote, which keeps its
         address and sign-in itself (PR 5's local link): only its label is the
         operator's to change. -->
    <p v-if="isLocal" class="remote-host-local-note">
      Linked automatically to this machine's SDR Manager. Only the label can be changed here.
    </p>
    <div v-else class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">IP ADDRESS</span>
      <input
        ref="addressRef"
        v-model="form.address"
        type="text"
        class="sdr-devices-form-input"
        aria-label="SDR host IP address or hostname"
        placeholder="192.168.1.x"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">LABEL</span>
      <input
        ref="labelRef"
        v-model="form.name"
        type="text"
        class="sdr-devices-form-input"
        aria-label="SDR host label"
        :placeholder="isLocal ? 'This machine' : 'e.g. Roof Pi'"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <template v-if="!isLocal">
      <div class="sdr-devices-form-row">
        <span class="sdr-devices-form-label">PORT</span>
        <input
          v-model.number="form.port"
          type="number"
          class="sdr-devices-form-input"
          aria-label="SDR Manager API port"
          placeholder="8000"
          min="1"
          max="65535"
        />
      </div>
      <div class="sdr-devices-form-row">
        <span class="sdr-devices-form-label">CONSOLE PASSWORD</span>
        <input
          v-model="form.authToken"
          type="password"
          class="sdr-devices-form-input"
          aria-label="SDR host console password"
          :placeholder="passwordPlaceholder"
          autocomplete="new-password"
          spellcheck="false"
        />
      </div>
    </template>

    <div
      v-if="probeResult"
      class="remote-host-probe"
      :class="{ 'remote-host-probe--fail': !probeResult.reachable }"
    >
      <SdrSourceStatusDot :connected="probeResult.reachable" />
      {{ probeResult.detail }}
    </div>

    <div v-if="shownError" class="sdr-devices-form-error" role="alert">{{ shownError }}</div>

    <!-- Only for a host that exists: there is nothing to report about one that
         has not been registered yet. -->
    <RemoteHostDetails v-if="host" :host="host" />

    <div class="sdr-devices-form-actions">
      <BaseButton
        v-if="host"
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        :disabled="probing"
        @click="probeExisting"
      >
        TEST CONNECTION
      </BaseButton>
      <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="emit('cancel')">
        CANCEL
      </BaseButton>
      <!-- Adding a host is an action, so it happens at once; an existing host's
           edits wait for APPLY CHANGES. -->
      <BaseButton
        v-if="!host"
        type="button"
        variant="primary"
        class="sdr-devices-btn sdr-devices-btn--primary"
        :style="PRIMARY_BUTTON_STYLE"
        :disabled="saving"
        @click="addHost"
      >
        ADD
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `RemoteHostForm` — the add/edit form for an SDR host: the operator enters
 * the host's IP address (plus an optional label, port defaulting to 8000, and
 * its console password).
 *
 * A new host is added at once with ADD, which then probes `POST .../test` and
 * reports reachability inline. An existing host's edits are drafted
 * (`draft`, null once they match what is saved) and saved by APPLY CHANGES
 * (`RemoteHostsControl`); its TEST CONNECTION probes the *stored* connection.
 *
 * The password is write-only end to end — the API never returns it, so this
 * form never shows a stored value, only the "password set" placeholder text and
 * a blank field that keeps the stored one when left empty on edit — unless
 * the address or port changes, when the backend drops it rather than send it
 * to a different machine, and the placeholder asks for it again.
 *
 * This machine's own row (`is_local`) shows the label alone: sdr-manager-remote
 * links it from core's registry and signs in with its service bearer, and the
 * API refuses any other change to it (409 `local_host_managed`).
 *
 * Below the fields (and above the actions) sits the collapsed `MORE`
 * disclosure — everything else known about this host, including its
 * latitude/longitude — so the editable fields stay the form's first content.
 *
 * It is the host's *console password*, not a token: the SDR Manager API has
 * no token auth for operators, and the client exchanges it for a session cookie.
 */
import { computed, ref, onMounted, watch } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import SdrSourceStatusDot from '@sentinel/ui/sdr/SdrSourceStatusDot.vue'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import RemoteHostDetails from './RemoteHostDetails.vue'
import type { RemoteHostDraft } from '../remoteHostEdits'
import {
  createHost,
  testHost,
  SdrManagerApiError,
  type SdrManagerHealthProbeResult,
} from '../api/sdrManagerRemoteApi'

// SAVE keeps SdrDeviceForm's undimmed disabled look; size and colours come
// from SettingsPanel.css's `.sdr-devices-form-actions` rule.
const PRIMARY_BUTTON_STYLE =
  '--ba-primary-font-weight: 600; --ba-disabled-opacity: 1; --ba-disabled-cursor: default'

const props = defineProps<{
  host: SdrManagerHost | null
  /** This host's staged edit, when it has one (the form reopens on it). */
  stagedDraft?: RemoteHostDraft | null
  /** Why APPLY CHANGES could not save this host's edit. */
  applyError?: string | null
}>()
const emit = defineEmits<{
  /** A new host was added. */
  save: []
  cancel: []
  /** The existing host's edited fields, or null when they match what is saved. */
  draft: [draft: RemoteHostDraft | null]
}>()

const addressRef = ref<HTMLInputElement | null>(null)
const labelRef = ref<HTMLInputElement | null>(null)
const isLocal = computed(() => props.host?.is_local === true)
const errorMsg = ref('')
const shownError = computed(() => errorMsg.value || props.applyError || '')
const saving = ref(false)
const probing = ref(false)
const probeResult = ref<SdrManagerHealthProbeResult | null>(null)

const savedForm: RemoteHostDraft = {
  address: props.host?.address ?? '',
  name: props.host?.name ?? '',
  port: props.host?.port ?? 8000,
  authToken: '',
}
const form = ref<RemoteHostDraft>({ ...(props.stagedDraft ?? savedForm) })

const passwordPlaceholder = computed(() => {
  if (!props.host?.auth_token_set) return "The password set on that host's console"
  const moved =
    form.value.address.trim() !== props.host.address ||
    (form.value.port || 8000) !== props.host.port
  return moved
    ? 'Address changed — enter the password again'
    : 'Password set — leave blank to keep it'
})

// The first editable field: the address, or the label on this machine's row.
onMounted(() => setTimeout(() => (addressRef.value ?? labelRef.value)?.focus(), 0))

watch(
  form,
  (draft) => {
    if (!props.host) return
    const unchanged = (Object.keys(savedForm) as (keyof RemoteHostDraft)[]).every(
      (field) => draft[field] === savedForm[field],
    )
    emit('draft', unchanged ? null : { ...draft })
  },
  { deep: true },
)

async function probeExisting(): Promise<void> {
  if (!props.host) return
  probing.value = true
  try {
    probeResult.value = await testHost(props.host.id)
  } catch {
    probeResult.value = { reachable: false, detail: 'Could not reach Sentinel to run the probe.' }
  } finally {
    probing.value = false
  }
}

async function addHost(): Promise<void> {
  const address = form.value.address.trim()
  if (!address) {
    errorMsg.value = 'IP address is required.'
    return
  }
  saving.value = true
  errorMsg.value = ''
  probeResult.value = null
  try {
    const savedHost = await createHost({
      name: form.value.name.trim() || null,
      address,
      port: form.value.port || 8000,
      auth_token: form.value.authToken,
    })
    // Report reachability of the connection just written, before closing the
    // form — an operator who mistyped the address sees it immediately.
    try {
      probeResult.value = await testHost(savedHost.id)
    } catch {
      /* the add itself already succeeded; a failed post-add probe is not fatal */
    }
    emit('save')
  } catch (error) {
    errorMsg.value = error instanceof SdrManagerApiError ? error.message : 'Save failed.'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.remote-host-local-note {
  margin: 0;
  padding: 8px 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: rgba(16, 19, 29, 0.75);
}
.remote-host-probe {
  display: flex;
  align-items: center;
  padding: 8px 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: rgba(16, 19, 29, 0.75);
}
.remote-host-probe--fail {
  color: #d94436;
}
</style>
