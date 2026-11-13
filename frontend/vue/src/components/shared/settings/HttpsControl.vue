<template>
  <div class="settings-https">
    <p class="settings-https-state" aria-live="polite">
      <span class="settings-https-label">{{ encrypted ? 'ENCRYPTED' : 'NOT ENCRYPTED' }}</span>
      {{
        encrypted
          ? 'This page is served over HTTPS.'
          : 'This page is plain HTTP: what you type here, a console password included, crosses the network readable.'
      }}
    </p>

    <p v-if="errorMessage" class="settings-https-error" role="alert">{{ errorMessage }}</p>
    <template v-else-if="authority">
      <div class="settings-https-row">
        <span class="settings-https-caption">FINGERPRINT</span>
        <code class="settings-https-fingerprint">{{
          fingerprintLines(authority.fingerprint)
        }}</code>
      </div>
      <p class="settings-https-note">
        Install this certificate once on each device you open Sentinel on, then use the HTTPS
        address. Check the fingerprint your device shows matches this one.
      </p>
      <div class="settings-https-actions">
        <BaseButton
          variant="ghost"
          class="settings-https-btn"
          href="/api/app/certificate-authority.crt"
          download="sentinel-certificate-authority.crt"
        >
          DOWNLOAD CERTIFICATE
        </BaseButton>
        <BaseButton
          v-if="!encrypted"
          variant="primary"
          class="settings-https-btn"
          :href="httpsAddress(authority.https_port)"
        >
          OPEN OVER HTTPS
        </BaseButton>
      </div>
    </template>
    <p v-else class="settings-https-note" aria-live="polite">Reading…</p>
  </div>
</template>

<script setup lang="ts">
/**
 * `HttpsControl` — Settings › App Settings › HTTPS: whether this page is
 * encrypted, and what a device needs to trust the HTTPS one.
 *
 * The gateway serves the page over HTTPS with a certificate this Sentinel's
 * own certificate authority issued, which no browser knows. So the card shows
 * that authority's fingerprint, downloads it (a plain link to the `.crt` file,
 * which phones open as "install this certificate") and, on plain HTTP, links
 * to the same page over HTTPS on the port core reports.
 */
import { computed, onMounted, ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import { pageLocation } from './pageLocation'

/** GET /api/app/certificate-authority. */
interface CertificateAuthority {
  certificate_authority: string
  fingerprint: string
  https_port: number
}

/** A SHA-256 fingerprint's 32 pairs as two even lines, broken between pairs. */
const PAIRS_PER_LINE = 16

const authority = ref<CertificateAuthority | null>(null)
const errorMessage = ref<string | null>(null)

const encrypted = computed(() => pageLocation().protocol === 'https:')

function fingerprintLines(fingerprint: string): string {
  const pairs = fingerprint.split(':')
  const lines: string[] = []
  for (let index = 0; index < pairs.length; index += PAIRS_PER_LINE) {
    lines.push(pairs.slice(index, index + PAIRS_PER_LINE).join(':'))
  }
  return lines.join('\n')
}

/** This same page over HTTPS: same host and path, on the gateway's HTTPS port. */
function httpsAddress(httpsPort: number): string {
  const { hostname, pathname, search, hash } = pageLocation()
  return `https://${hostname}:${httpsPort}${pathname}${search}${hash}`
}

onMounted(async () => {
  try {
    const response = await fetch('/api/app/certificate-authority')
    if (response.status === 404) {
      errorMessage.value =
        'This Sentinel has no certificate yet: run docker compose up -d on the machine it runs on.'
      return
    }
    if (!response.ok) throw new Error(String(response.status))
    authority.value = (await response.json()) as CertificateAuthority
  } catch {
    errorMessage.value = 'Could not read this Sentinel’s certificate.'
  }
})
</script>

<style scoped>
.settings-https {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.settings-https-state,
.settings-https-note {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  line-height: 1.55;
  color: var(--ink-secondary);
}
.settings-https-label {
  margin-right: 6px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink);
}
.settings-https-error {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--danger-strong);
}
/* The caption in BaseFormField's label column (110px, then 14px), as on the
   SDR cards, the value where inputs start. */
.settings-https-row {
  display: grid;
  grid-template-columns: var(--ba-form-field-label-width, 110px) minmax(0, 1fr);
  column-gap: 14px;
  align-items: baseline;
}
.settings-https-caption {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.6);
}
.settings-https-fingerprint {
  white-space: pre-wrap;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
  font-size: var(--settings-text-value);
  line-height: 1.6;
  color: var(--ink);
}
.settings-https-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
</style>
