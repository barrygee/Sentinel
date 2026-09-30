<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
// The caption names what the switch will do next, so it flips with the value.
// The store mirrors the toggle immediately, so it tracks the switch in real time.
const toggleCaption = computed(() =>
  app.notificationSound ? 'Disable alert sound' : 'Enable alert sound',
)
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    :label="toggleCaption"
    :accessible-name="toggleCaption"
    namespace="app"
    setting-key="notificationSound"
    :hydrate-from-db="app.hydrateNotificationSoundFromDb"
    :read-from-store="() => app.notificationSound"
    :mirror-to-store="app.setNotificationSound"
    @stage="emit('stage', $event)"
  />
</template>
