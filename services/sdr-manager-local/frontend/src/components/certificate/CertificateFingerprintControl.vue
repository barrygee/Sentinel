<template>
  <div class="sdr-devices-accordion certificate-fingerprint">
    <p class="certificate-fingerprint-note sdr-devices-note">
      Other Sentinels show this fingerprint when they add this machine. Tell whoever adds it to
      trust it only if theirs matches.
    </p>
    <p v-if="fingerprint" class="certificate-fingerprint-value">
      <span class="certificate-fingerprint-label">FINGERPRINT (SHA-256)</span>
      <code>{{ fingerprint }}</code>
    </p>
    <p v-else-if="errorMessage" class="sdr-devices-form-error" role="alert">{{ errorMessage }}</p>
    <p v-else class="certificate-fingerprint-note sdr-devices-note" aria-live="polite">Reading…</p>
  </div>
</template>

<script setup lang="ts">
/**
 * `CertificateFingerprintControl` — the CERTIFICATE card: the SHA-256
 * fingerprint of this deployment's certificate authority, which signs the
 * certificate this machine's SDR Manager serves HTTPS with. Another
 * Sentinel's operator compares it with the one their ADD shows before
 * trusting this machine, so it is shown without signing in.
 */
import { onMounted, ref } from 'vue'
import { getCertificateAuthority } from '../../api/sdrManagerLocalApi'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import '@sentinel/shell-api/settings/styles/deviceList.css'

const fingerprint = ref('')
const errorMessage = ref('')

onMounted(async () => {
  try {
    fingerprint.value = (await getCertificateAuthority()).fingerprint
  } catch (error) {
    errorMessage.value =
      error instanceof SdrManagerApiError && error.code === 'no_certificate_authority'
        ? 'No certificate yet: run docker compose up -d on this machine.'
        : "Could not read this machine's certificate."
  }
})
</script>

<style scoped>
/* The fingerprint sits in a row like the other cards' fields: the caption in
   BaseFormField's label column (--ba-form-field-label-width, 110px, then a
   14px gap) in its caption style, the value where their inputs start. */
.certificate-fingerprint-value {
  display: grid;
  grid-template-columns: var(--ba-form-field-label-width, 110px) minmax(0, 1fr);
  column-gap: 14px;
  align-items: baseline;
  margin: 0;
}
.certificate-fingerprint-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.6);
}
.certificate-fingerprint-value code {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
  font-size: var(--settings-text-value);
  line-height: 1.6;
  color: var(--ink);
  overflow-wrap: anywhere;
}
</style>
