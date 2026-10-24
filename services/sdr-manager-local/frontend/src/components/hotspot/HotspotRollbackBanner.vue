<template>
  <div class="hotspot-rollback" role="group" :aria-labelledby="headingId">
    <p :id="headingId" class="hotspot-rollback-text">
      This hotspot is on trial. Join it from another device to check it works, then keep it — or it
      undoes itself in <strong>{{ secondsLeft }} s</strong>.
    </p>
    <p class="sr-only" aria-live="assertive">{{ warning }}</p>
    <div class="sdr-devices-form-actions">
      <BaseButton
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        :disabled="busy"
        @click="emit('undo')"
      >
        UNDO NOW
      </BaseButton>
      <BaseButton
        type="button"
        variant="primary"
        class="sdr-devices-btn"
        :disabled="busy"
        @click="emit('keep')"
      >
        KEEP IT
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `HotspotRollbackBanner` — a hotspot change that is up on trial and rolls
 * itself back at `deadlineMs` unless confirmed, so a change that cuts this
 * machine off the network can't strand it. Counts down, and warns screen
 * readers at 60, 30 and 10 seconds rather than every second.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'

const props = defineProps<{ deadlineMs: number; busy: boolean }>()
const emit = defineEmits<{ keep: []; undo: [] }>()

const WARNING_SECONDS = new Set([60, 30, 10])
const headingId = 'sdr-manager-local-hotspot-rollback'
const now = ref(Date.now())
const warning = ref('')

const secondsLeft = computed(() => Math.max(0, Math.round((props.deadlineMs - now.value) / 1000)))

const timer = setInterval(() => {
  now.value = Date.now()
  if (WARNING_SECONDS.has(secondsLeft.value)) {
    warning.value = `${secondsLeft.value} seconds left to keep the hotspot.`
  }
}, 1000)

onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.hotspot-rollback {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(var(--accent-rgb), 0.12);
}
.hotspot-rollback-text {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  line-height: 1.5;
  color: var(--ink);
}
</style>
