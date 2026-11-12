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
      <p :id="descriptionId" class="remote-host-certificate-text">
        Compare this fingerprint with the one the SDR host shows (its Settings › SDR Manager, or its
        sdr-manager-local log). Trust it only if they match.
      </p>
      <dl class="remote-host-certificate-facts">
        <div>
          <dt>FINGERPRINT (SHA-256)</dt>
          <dd>
            <code class="remote-host-certificate-fingerprint">{{ fingerprintLines }}</code>
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
      <p v-if="preview.matches_pinned === true" class="remote-host-certificate-text">
        This is the certificate already trusted for this host.
      </p>
    </template>
    <template v-else>
      <p :id="descriptionId" class="remote-host-certificate-text remote-host-certificate-warning">
        {{ preview.detail }}
      </p>
      <p v-if="allowPlainHttp" class="remote-host-certificate-text">
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

/** Fingerprint byte pairs shown per line, so 32 pairs read as two even rows. */
const PAIRS_PER_LINE = 16

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
const fingerprintLines = computed(() => {
  const pairs = (props.preview.fingerprint ?? '').split(':')
  const lines: string[] = []
  for (let index = 0; index < pairs.length; index += PAIRS_PER_LINE) {
    lines.push(pairs.slice(index, index + PAIRS_PER_LINE).join(':'))
  }
  return lines.join('\n')
})

onMounted(() => nextTick(() => headingRef.value?.focus()))
</script>

<style scoped>
.remote-host-certificate {
  padding: 8px 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  letter-spacing: 0.02em;
  color: rgba(16, 19, 29, 0.85);
}
.remote-host-certificate-heading {
  margin: 0 0 6px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.remote-host-certificate-heading:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.remote-host-certificate-text {
  margin: 0 0 8px;
}
.remote-host-certificate-warning {
  /* --danger-strong: AA contrast on the light settings canvas. */
  color: var(--danger-strong);
}
.remote-host-certificate-facts {
  margin: 0 0 8px;
}
.remote-host-certificate-facts > div {
  padding: 4px 0;
}
.remote-host-certificate-facts dt {
  font-weight: 600;
  letter-spacing: 0.06em;
}
.remote-host-certificate-facts dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
}
.remote-host-certificate-fingerprint {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
  font-size: var(--settings-text-small);
}
</style>
