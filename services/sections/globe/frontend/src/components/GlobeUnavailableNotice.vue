<script setup lang="ts">
/**
 * Says why the globe isn't showing, as the app's warning strip, centred over
 * the globe's space. For now the one reason is a browser or device without
 * WebGL; the live layers add theirs (ADS-B limit, no APRS decoder) later.
 */
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'

defineProps<{
  /** The explanation to show. */
  message: string
}>()
</script>

<template>
  <div class="globe-unavailable-notice">
    <BaseWarningNotice :message="message" />
  </div>
</template>

<style scoped>
.globe-unavailable-notice {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0 16px;
}
</style>
