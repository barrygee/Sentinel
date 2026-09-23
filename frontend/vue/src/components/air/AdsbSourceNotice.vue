<template>
  <MapNoticeBanner v-if="error" class="adsb-source-notice" :message="error.message">
    <template v-if="error.code === 'device_reserved'" #action>
      <button
        type="button"
        class="adsb-source-notice-action"
        :disabled="isClaiming"
        @click="emit('takeControl')"
      >
        {{ isClaiming ? 'Taking…' : 'Take control' }}
      </button>
    </template>
  </MapNoticeBanner>
</template>

<script setup lang="ts">
/**
 * Says why the off-grid map is empty, when it is empty for a reason.
 *
 * This is the point of the whole claim mechanism from an operator's side. The
 * original failure was a map with no aircraft and nothing to act on: the dongle
 * was on the wrong frequency, or another consumer had it, or the Pi was
 * unreachable, and all three looked identical — like quiet skies.
 *
 * Only rendered when there is something to say. A claim that succeeded needs no
 * announcement: the aircraft are the confirmation.
 *
 * `device_reserved` is the one case with an action attached, because it is the
 * one the operator can resolve from here. Taking the device is deliberately a
 * button rather than something the retry loop does on its own — winning a fight
 * over hardware should be a decision, not a side effect of a timer.
 */
import type { AdsbClaimError } from '@/services/adsbSourceApi'
import MapNoticeBanner from '@/components/shared/MapNoticeBanner.vue'

defineProps<{
  error: AdsbClaimError | null
  isClaiming: boolean
}>()

const emit = defineEmits<{ takeControl: [] }>()
</script>

<style scoped>
/* The banner itself is styled by MapNoticeBanner; only this domain's extra
   control needs rules of its own. */
.adsb-source-notice-action {
  padding: 6px 12px;
  border: none;
  border-radius: 0;
  background: var(--accent-ink);
  color: var(--overlay-ink);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.adsb-source-notice-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
