<template>
  <span class="remote-host-test" aria-live="polite">
    <BaseButton
      type="button"
      variant="ghost"
      class="sdr-devices-btn"
      :class="`remote-host-test-btn--${state}`"
      :style="state === 'idle' ? undefined : UNDIMMED_STYLE"
      :disabled="state !== 'idle'"
      @click="emit('test')"
    >
      {{ LABELS[state] }}
    </BaseButton>
  </span>
</template>

<script setup lang="ts">
/**
 * `RemoteHostTestButton` — tests a host's connection and shows how it went on the
 * button itself, which can't be pressed again until the state returns to `idle`.
 */
import BaseButton from '@sentinel/ui/base/BaseButton.vue'

/** Where a connection test has got to. */
export type HostTestState = 'idle' | 'connecting' | 'connected' | 'failed'

const LABELS: Readonly<Record<HostTestState, string>> = {
  idle: 'TEST CONNECTION',
  connecting: 'CONNECTING',
  connected: 'SUCCESSFULLY CONNECTED',
  failed: 'UNSUCCESSFUL',
}

// A result has to stay readable, so it skips the dimmed disabled look.
const UNDIMMED_STYLE = '--ba-disabled-opacity: 1; --ba-disabled-cursor: default'

defineProps<{ state: HostTestState }>()
const emit = defineEmits<{ test: [] }>()
</script>

<style scoped>
/* Keeps the button a direct item of the actions row. */
.remote-host-test {
  display: contents;
}
.remote-host-test-btn--connected {
  --ba-ghost-bg: var(--color-accent);
  --ba-ghost-color: var(--accent-ink);
}
.remote-host-test-btn--failed {
  --ba-ghost-bg: var(--danger-strong);
  --ba-ghost-color: #ffffff;
}
</style>
