<template>
  <div class="certificate-fingerprint">
    <p class="certificate-fingerprint-note">
      Other Sentinels show this fingerprint when they add this machine. Tell whoever adds it to
      trust it only if theirs matches.
    </p>
    <p v-if="fingerprint" class="certificate-fingerprint-value">
      <span class="certificate-fingerprint-label">FINGERPRINT (SHA-256)</span>
      <code>{{ fingerprint }}</code>
    </p>
    <p v-else-if="errorMessage" class="sdr-devices-form-error" role="alert">{{ errorMessage }}</p>
    <p v-else class="certificate-fingerprint-note" aria-live="polite">Reading…</p>
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
.certificate-fingerprint {
  padding: 4px 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  letter-spacing: 0.02em;
  color: var(--ink-secondary);
}
.certificate-fingerprint-note {
  margin: 0 0 8px;
}
.certificate-fingerprint-value {
  margin: 0;
  overflow-wrap: anywhere;
}
.certificate-fingerprint-label {
  display: block;
  font-weight: 600;
  letter-spacing: 0.08em;
  margin-bottom: 2px;
}
.certificate-fingerprint-value code {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
}
</style>
