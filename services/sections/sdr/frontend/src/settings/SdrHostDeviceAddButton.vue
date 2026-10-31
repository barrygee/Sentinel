<template>
  <BaseButton
    variant="ghost"
    class="sdr-devices-btn"
    :style="ADD_BUTTON_STYLE"
    :disabled="!canAdd || adding"
    :title="addBlockedReason || undefined"
    @click="emit('add')"
  >
    {{ adding ? 'ADDING…' : 'ADD' }}
  </BaseButton>
</template>

<script setup lang="ts">
/**
 * `SdrHostDeviceAddButton` — ADD for one of a Sentinel host's SDRs: creates
 * the radio that mirrors it. Disabled, with the reason as its title, while
 * the SDR can't be added (`hostDeviceAddBlockedReason`), and while adding.
 */
import { computed } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { SdrManagerDeviceStatus } from '@sentinel/shell-api/types/sdrManager'
import { hostDeviceAddBlockedReason } from './hostDeviceAvailability'

const ADD_BUTTON_STYLE =
  '--ba-ghost-height: auto; --ba-ghost-padding: 8px 18px; --ba-ghost-font-size: var(--settings-text-caption); ' +
  '--ba-ghost-color: rgba(16, 19, 29, 0.6); --ba-ghost-hover-color: rgba(16, 19, 29, 0.9)'

const props = defineProps<{
  device: SdrManagerDeviceStatus
  /** True while this SDR's ADD request is in flight. */
  adding: boolean
}>()
const emit = defineEmits<{ add: [] }>()

/** Why ADD is unavailable, in the operator's terms. Empty when it is available. */
const addBlockedReason = computed(() => hostDeviceAddBlockedReason(props.device))
/** Addable exactly when there is no reason not to be — one source of truth. */
const canAdd = computed(() => addBlockedReason.value === '')
</script>
