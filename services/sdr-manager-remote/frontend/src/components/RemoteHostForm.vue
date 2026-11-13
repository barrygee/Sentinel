<template>
  <div class="sdr-devices-accordion">
    <!-- This machine's row is linked by sdr-manager-remote, which keeps its
         address and sign-in itself (PR 5's local link): only its label and
         ADD SDRS are the operator's to change. -->
    <p v-if="isLocal" class="remote-host-local-note sdr-devices-note">
      Linked automatically to this machine's SDR Manager. Only the label and how its SDRs are added
      can be changed here.
    </p>
    <BaseTextField
      v-else
      ref="addressRef"
      v-model="form.address"
      v-bind="FIELD"
      label="IP ADDRESS"
      aria-label="SDR host IP address or hostname"
      placeholder="192.168.1.x"
      autocomplete="off"
      spellcheck="false"
    />
    <BaseTextField
      ref="labelRef"
      v-model="form.name"
      v-bind="FIELD"
      label="LABEL"
      aria-label="SDR host label"
      :placeholder="isLocal ? 'This machine' : 'e.g. Roof Pi'"
      autocomplete="off"
      spellcheck="false"
    />
    <template v-if="!isLocal">
      <BaseTextField
        v-model.number="form.port"
        v-bind="FIELD"
        label="PORT"
        input-type="number"
        aria-label="SDR Manager API port"
        placeholder="8000"
        min="1"
        max="65535"
      />
      <BaseTextField
        v-model="form.authToken"
        v-bind="FIELD"
        label="CONSOLE PASSWORD"
        input-type="password"
        aria-label="SDR host console password"
        :placeholder="passwordPlaceholder"
        autocomplete="new-password"
        spellcheck="false"
      />
    </template>

    <BaseFormField
      v-slot="{ labelId }"
      v-bind="FIELD"
      wrap-control
      :control-id="autoAddFieldId"
      label="ADD SDRS"
      label-kind="group"
    >
      <RemoteHostAutoAddToggle v-model="form.autoAddSdrs" :labelled-by="labelId" />
    </BaseFormField>
    <p v-if="!form.autoAddSdrs" class="remote-host-auto-add-note sdr-devices-note">
      Choose which of its SDRs become radios with ADD.
    </p>

    <div v-if="probeFailure" class="remote-host-probe">{{ probeFailure }}</div>

    <div v-if="shownError" class="sdr-devices-form-error" role="alert">{{ shownError }}</div>

    <!-- How an existing host's connection is secured, and trusting its
         certificate. This machine is verified by the deployment itself. -->
    <RemoteHostConnectionSecurity v-if="host && !isLocal" :host="host" />

    <!-- Only for a host that exists: there is nothing to report about one that
         has not been registered yet. -->
    <RemoteHostDetails v-if="host" :host="host" />

    <!-- Adding: the certificate the host presents, to compare before it is
         trusted (or, for a host without HTTPS, the choice to go without). -->
    <RemoteHostCertificateCheck
      v-if="!host && pendingPreview"
      :preview="pendingPreview"
      :busy="saving"
      allow-plain-http
      trust-label="TRUST AND ADD"
      @confirm="addHost"
      @cancel="pendingPreview = null"
    />

    <div v-else class="sdr-devices-form-actions">
      <RemoteHostTestButton v-if="host" :state="testState" @test="probeExisting" />
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
        @click="checkNewHost"
      >
        {{ saving ? 'CHECKING' : 'ADD' }}
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
 * A new host is added at once with ADD. ADD first reads the certificate
 * authority the host presents (`POST .../certificate`) and shows its
 * fingerprint to compare with the host's own (`RemoteHostCertificateCheck`);
 * TRUST AND ADD then adds it with that fingerprint, which the backend pins
 * only if the host still presents it. A host without HTTPS can be added
 * without encryption, as the operator's explicit choice. After adding, it
 * probes `POST .../test` and reports reachability inline. An existing host's edits are drafted
 * (`draft`, null once they match what is saved) and saved by APPLY CHANGES
 * (`RemoteHostHeader`); its TEST CONNECTION probes the *stored* connection.
 *
 * The password is write-only end to end — the API never returns it, so this
 * form never shows a stored value, only the "password set" placeholder text and
 * a blank field that keeps the stored one when left empty on edit — unless
 * the address or port changes, when the backend drops it rather than send it
 * to a different machine, and the placeholder asks for it again.
 *
 * This machine's own row (`is_local`) shows only the label and ADD SDRS:
 * sdr-manager-remote links it from core's registry and signs in with its
 * service bearer, and the API refuses any other change to it (409
 * `local_host_managed`).
 *
 * ADD SDRS picks how the host's SDRs become radios: MANUALLY (the default),
 * one at a time with ADD, or AUTOMATICALLY, every public one by itself
 * (`auto_add_sdrs`; sdr-manager-remote's poller adds them).
 *
 * Below the fields (and above the actions) sits the collapsed `MORE`
 * disclosure — everything else known about this host, including its
 * latitude/longitude — so the editable fields stay the form's first content.
 *
 * It is the host's *console password*, not a token: the SDR Manager API has
 * no token auth for operators, and the client exchanges it for a session cookie.
 */
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseFormField from '@sentinel/ui/base/BaseFormField.vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import RemoteHostDetails from './RemoteHostDetails.vue'
import RemoteHostTestButton, { type HostTestState } from './RemoteHostTestButton.vue'
import RemoteHostAutoAddToggle from './RemoteHostAutoAddToggle.vue'
import RemoteHostCertificateCheck from './RemoteHostCertificateCheck.vue'
import RemoteHostConnectionSecurity from './RemoteHostConnectionSecurity.vue'
import type { RemoteHostDraft } from '../remoteHostEdits'
import {
  createHost,
  previewCertificate,
  testHost,
  SdrManagerApiError,
  type SdrManagerCertificatePreview,
} from '../api/sdrManagerRemoteApi'
import '@sentinel/shell-api/settings/styles/deviceList.css'

/** Every field of this form: the Settings hairline look, caption in a column beside the value. */
const FIELD = { density: 'settings', layout: 'inline' } as const

// SAVE keeps SdrDeviceForm's undimmed disabled look; size and colours come
// from deviceList.css's `.sdr-devices-form-actions` rule.
const PRIMARY_BUTTON_STYLE =
  '--ba-primary-font-weight: 600; --ba-disabled-opacity: 1; --ba-disabled-cursor: default'

/** How long a test's result stays on the button before it can be run again. */
const TEST_RESULT_HOLD_MS = 4000

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

const addressRef = ref<{ focus: () => void } | null>(null)
const labelRef = ref<{ focus: () => void } | null>(null)
const isLocal = computed(() => props.host?.is_local === true)
const errorMsg = ref('')
const shownError = computed(() => errorMsg.value || props.applyError || '')
const saving = ref(false)
const testState = ref<HostTestState>('idle')
/** Why the last test failed; a success needs no words beyond the button's. */
const probeFailure = ref('')
/** What the new host presented on ADD, waiting for the operator's decision. */
const pendingPreview = ref<SdrManagerCertificatePreview | null>(null)
let testResetTimer: ReturnType<typeof setTimeout> | undefined

const savedForm: RemoteHostDraft = {
  address: props.host?.address ?? '',
  name: props.host?.name ?? '',
  port: props.host?.port ?? 8000,
  authToken: '',
  // Off unless the operator turns it on: which SDRs are radios is theirs to choose.
  autoAddSdrs: props.host?.auto_add_sdrs ?? false,
}
// Unique per form, so two open forms never share the ADD SDRS caption's id.
const autoAddFieldId = `remote-host-${props.host?.id ?? 'new'}-auto-add`
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
  testState.value = 'connecting'
  probeFailure.value = ''
  try {
    const result = await testHost(props.host.id)
    testState.value = result.reachable ? 'connected' : 'failed'
    if (!result.reachable) probeFailure.value = result.detail
  } catch {
    testState.value = 'failed'
    probeFailure.value = 'Could not reach Sentinel to run the probe.'
  }
  testResetTimer = setTimeout(() => {
    testState.value = 'idle'
  }, TEST_RESULT_HOLD_MS)
}

onBeforeUnmount(() => clearTimeout(testResetTimer))

/** ADD: read the certificate the host presents, for the operator to check before anything is stored. */
async function checkNewHost(): Promise<void> {
  const address = form.value.address.trim()
  if (!address) {
    errorMsg.value = 'IP address is required.'
    return
  }
  saving.value = true
  errorMsg.value = ''
  probeFailure.value = ''
  try {
    pendingPreview.value = await previewCertificate({ address, port: form.value.port || 8000 })
  } catch (error) {
    errorMsg.value =
      error instanceof SdrManagerApiError ? error.message : "Could not read the host's certificate."
  } finally {
    saving.value = false
  }
}

/** TRUST AND ADD (or ADD WITHOUT ENCRYPTION): add the host with the certificate just checked. */
async function addHost(): Promise<void> {
  const preview = pendingPreview.value
  if (!preview) return
  saving.value = true
  errorMsg.value = ''
  try {
    const savedHost = await createHost({
      name: form.value.name.trim() || null,
      address: form.value.address.trim(),
      port: form.value.port || 8000,
      auth_token: form.value.authToken,
      auto_add_sdrs: form.value.autoAddSdrs,
      ...(preview.tls_available && preview.fingerprint
        ? { transport: 'https' as const, tls_fingerprint: preview.fingerprint }
        : { transport: 'http' as const }),
    })
    pendingPreview.value = null
    // Report reachability of the connection just written, before closing the
    // form — an operator who mistyped the address sees it immediately.
    try {
      const result = await testHost(savedHost.id)
      if (!result.reachable) probeFailure.value = result.detail
    } catch {
      /* the add itself already succeeded; a failed post-add probe is not fatal */
    }
    emit('save')
  } catch (error) {
    // A `certificate_changed` refusal means the check on screen is stale:
    // close it, so ADD reads the host again.
    pendingPreview.value = null
    errorMsg.value = error instanceof SdrManagerApiError ? error.message : 'Save failed.'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.remote-host-probe {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  letter-spacing: 0.02em;
  /* --danger-strong: AA contrast on the light settings canvas. */
  color: var(--danger-strong);
}
</style>
