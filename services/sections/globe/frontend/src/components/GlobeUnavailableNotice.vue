<script setup lang="ts">
/**
 * Says why something isn't showing, as the app's warning strip. `centre`
 * (the default) fills the globe's space and centres the strip, for the globe
 * itself being impossible (no WebGL); `inline` is a plain strip, for a layer
 * that is empty (ADS-B limit reached, a section down, no APRS decoder), placed
 * by its container.
 */
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'

withDefaults(
  defineProps<{
    /** The explanation to show. */
    message: string
    /** Centred over the globe, or an inline strip. */
    placement?: 'centre' | 'inline'
    /** Show a × that emits `dismiss`. */
    dismissible?: boolean
  }>(),
  { placement: 'centre', dismissible: false },
)

const emit = defineEmits<{
  /** The viewer closed the notice. */
  dismiss: []
}>()
</script>

<template>
  <div class="globe-unavailable-notice" :class="`globe-unavailable-notice--${placement}`">
    <BaseWarningNotice :message="message" :dismissible="dismissible" @dismiss="emit('dismiss')" />
  </div>
</template>

<style scoped>
.globe-unavailable-notice--centre {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0 16px;
}
</style>
