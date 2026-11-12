<template>
  <div class="remote-host-security">
    <p class="remote-host-security-state" :class="`remote-host-security-state--${state.tone}`">
      <span class="remote-host-security-label">{{ state.label }}</span>
      {{ state.detail }}
    </p>
    <p v-if="host.tls_fingerprint && !preview" class="remote-host-security-fingerprint">
      Trusted certificate fingerprint:
      <code>{{ host.tls_fingerprint }}</code>
    </p>

    <RemoteHostCertificateCheck
      v-if="preview"
      :preview="preview"
      :busy="busy"
      trust-label="TRUST CERTIFICATE"
      @confirm="trust"
      @cancel="preview = null"
    />
    <div v-else class="sdr-devices-form-actions">
      <BaseButton
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        :disabled="busy"
        @click="check"
      >
        {{ busy ? 'CHECKING' : 'CHECK CERTIFICATE' }}
      </BaseButton>
    </div>

    <div v-if="errorMessage" class="sdr-devices-form-error" role="alert">{{ errorMessage }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * `RemoteHostConnectionSecurity` — how an existing SDR host's connection is
 * secured (`tls_state`), and CHECK CERTIFICATE to read what the host presents
 * now and trust it: the way to move a plain-HTTP host to HTTPS once it offers
 * it, to trust a host whose address changed, and to accept a host whose
 * credentials were regenerated (CERTIFICATE CHANGED).
 *
 * Trusting acts at once, like adding a host, and is announced
 * (`announceHostsChanged`) so the host list re-reads the new state. Not shown
 * for this machine's row, which the deployment's own authority verifies.
 */
import { computed, ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { SdrManagerHost, SdrManagerTlsState } from '@sentinel/shell-api/types/sdrManager'
import RemoteHostCertificateCheck from './RemoteHostCertificateCheck.vue'
import {
  previewHostCertificate,
  SdrManagerApiError,
  trustHostCertificate,
  type SdrManagerCertificatePreview,
} from '../api/sdrManagerRemoteApi'
import { announceHostsChanged } from '../hostsChanged'
import '@sentinel/shell-api/settings/styles/deviceList.css'

/** What each state says, and whether it is good news. */
const STATES: Readonly<
  Record<SdrManagerTlsState, { label: string; detail: string; tone: 'good' | 'warn' }>
> = {
  pinned: {
    label: 'ENCRYPTED',
    detail: 'HTTPS, checked against the trusted certificate.',
    tone: 'good',
  },
  deployment: {
    label: 'ENCRYPTED',
    detail: "HTTPS, checked by this Sentinel's own certificate.",
    tone: 'good',
  },
  changed: {
    label: 'CERTIFICATE CHANGED',
    detail:
      'The host presented a different certificate, so nothing is sent to it. Check it before trusting it.',
    tone: 'warn',
  },
  untrusted: {
    label: 'NOT TRUSTED YET',
    detail: 'Nothing is sent to this host until you check and trust its certificate.',
    tone: 'warn',
  },
  insecure: {
    label: 'NOT ENCRYPTED',
    detail: 'Plain HTTP: the console password crosses the network readable.',
    tone: 'warn',
  },
}

const props = defineProps<{ host: SdrManagerHost }>()

const preview = ref<SdrManagerCertificatePreview | null>(null)
const busy = ref(false)
const errorMessage = ref('')
// A host list from an sdr-manager-remote older than HTTPS (mid-upgrade) has no
// `tls_state`: those hosts are all plain HTTP.
const state = computed(() => STATES[props.host.tls_state] ?? STATES.insecure)

function describe(error: unknown, fallback: string): string {
  return error instanceof SdrManagerApiError ? error.message : fallback
}

async function check(): Promise<void> {
  busy.value = true
  errorMessage.value = ''
  try {
    preview.value = await previewHostCertificate(props.host.id)
  } catch (error) {
    errorMessage.value = describe(error, "Could not read the host's certificate.")
  } finally {
    busy.value = false
  }
}

async function trust(): Promise<void> {
  const fingerprint = preview.value?.fingerprint
  if (!fingerprint) return
  busy.value = true
  errorMessage.value = ''
  try {
    await trustHostCertificate(props.host.id, fingerprint)
    preview.value = null
    announceHostsChanged()
  } catch (error) {
    // `certificate_changed`: the host's fingerprint moved after the check, so
    // the one on screen is no longer the one to trust: check again.
    preview.value = null
    errorMessage.value = describe(error, 'Could not trust the certificate.')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.remote-host-security {
  padding: 8px 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  letter-spacing: 0.02em;
  color: rgba(16, 19, 29, 0.85);
}
.remote-host-security-state,
.remote-host-security-fingerprint {
  margin: 0 0 6px;
  overflow-wrap: anywhere;
}
.remote-host-security-label {
  font-weight: 600;
  letter-spacing: 0.08em;
  margin-right: 6px;
}
.remote-host-security-state--warn .remote-host-security-label {
  /* --danger-strong: AA contrast on the light settings canvas. */
  color: var(--danger-strong);
}
.remote-host-security-fingerprint code {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
}
</style>
