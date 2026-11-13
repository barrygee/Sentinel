<template>
  <div
    class="remote-host-certificate"
    role="group"
    :aria-labelledby="headingId"
    :aria-describedby="descriptionId"
  >
    <p :id="headingId" ref="headingRef" class="remote-host-certificate-heading" tabindex="-1">
      {{ preview.tls_available ? "CHECK THE HOST'S CERTIFICATE" : 'NO ENCRYPTION' }}
    </p>

    <template v-if="preview.tls_available">
      <p :id="descriptionId" class="sdr-devices-note remote-host-certificate-text">
        Compare this fingerprint with the one the SDR host shows (its Settings › SDR Manager, or its
        sdr-manager-local log). Trust it only if they match.
      </p>
      <dl class="remote-host-certificate-facts">
        <div>
          <dt>FINGERPRINT (SHA-256)</dt>
          <dd>
            <code class="remote-host-certificate-fingerprint">{{ fingerprintText }}</code>
          </dd>
        </div>
        <div v-if="preview.subject">
          <dt>ISSUED TO</dt>
          <dd>{{ preview.subject }}</dd>
        </div>
        <div v-if="preview.not_valid_after">
          <dt>VALID UNTIL</dt>
          <dd>{{ preview.not_valid_after }}</dd>
        </div>
      </dl>
      <p
        v-if="preview.matches_pinned === true"
        class="sdr-devices-note remote-host-certificate-text"
      >
        This is the certificate already trusted for this host.
      </p>
    </template>
    <template v-else>
      <p
        :id="descriptionId"
        class="sdr-devices-note remote-host-certificate-text remote-host-certificate-warning"
      >
        {{ preview.detail }}
      </p>
      <p v-if="allowPlainHttp" class="sdr-devices-note remote-host-certificate-text">
        Add it without encryption only on a network you trust, and update the host when you can.
      </p>
    </template>

    <div class="sdr-devices-form-actions">
      <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="emit('cancel')">
        {{ confirmable ? 'CANCEL' : 'CLOSE' }}
      </BaseButton>
      <BaseButton
        v-if="confirmable"
        type="button"
        variant="primary"
        class="sdr-devices-btn sdr-devices-btn--primary"
        :disabled="busy"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `RemoteHostCertificateCheck` — trust on first use, the operator's half: shows
 * the certificate authority an SDR host presents (its SHA-256 fingerprint,
 * who it was issued to, until when) so the operator can compare it with the
 * fingerprint the host itself shows before trusting it.
 *
 * A host that serves plain HTTP only gets a warning instead, and — when
 * `allowPlainHttp` (adding a host) — the choice to add it without encryption.
 * `confirm` means "trust this" (or "add without encryption"); the caller
 * sends the fingerprint shown here, and the backend refuses if the host's has
 * changed since.
 *
 * Focus moves to its heading when it appears, so a screen reader announces
 * the check rather than leaving focus on the button that opened it.
 */
import { computed, nextTick, onMounted, ref, useId } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { SdrManagerCertificatePreview } from '../api/sdrManagerRemoteApi'
import { fingerprintLines } from '../fingerprintLines'

const props = withDefaults(
  defineProps<{
    preview: SdrManagerCertificatePreview
    /** A request is in flight: the confirm button waits. */
    busy?: boolean
    /** Offer to add a host that has no HTTPS over plain HTTP (adding only). */
    allowPlainHttp?: boolean
    /** The confirm button's words over HTTPS. */
    trustLabel?: string
  }>(),
  { busy: false, allowPlainHttp: false, trustLabel: 'TRUST' },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()

// Unique per instance, so two open checks never share a heading id.
const instanceId = `remote-host-certificate-${useId()}`
const headingId = `${instanceId}-heading`
const descriptionId = `${instanceId}-description`
const headingRef = ref<HTMLElement | null>(null)

const confirmable = computed(() => props.preview.tls_available || props.allowPlainHttp)
const confirmLabel = computed(() =>
  props.preview.tls_available ? props.trustLabel : 'ADD WITHOUT ENCRYPTION',
)
const fingerprintText = computed(() => fingerprintLines(props.preview.fingerprint))

onMounted(() => nextTick(() => headingRef.value?.focus()))
</script>

<style scoped>
/* Laid out like the form above it: the card's 16px rhythm between parts,
   notes in the card description's size (.sdr-devices-note), and each fact a
   row with its caption in BaseFormField's label column (110px, then 14px). */
.remote-host-certificate {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.remote-host-certificate-heading {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink);
}
.remote-host-certificate-heading:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.remote-host-certificate-warning {
  /* --danger-strong: AA contrast on the light settings canvas. */
  color: var(--danger-strong);
}
.remote-host-certificate-facts {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
}
.remote-host-certificate-facts > div {
  display: grid;
  grid-template-columns: var(--ba-form-field-label-width, 110px) minmax(0, 1fr);
  column-gap: 14px;
  align-items: baseline;
}
.remote-host-certificate-facts dt {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.5;
  color: rgba(var(--ink-rgb), 0.6);
}
.remote-host-certificate-facts dd {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-value);
  color: var(--ink);
  overflow-wrap: anywhere;
}
.remote-host-certificate-fingerprint {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
  font-size: var(--settings-text-value);
  line-height: 1.6;
}
</style>
