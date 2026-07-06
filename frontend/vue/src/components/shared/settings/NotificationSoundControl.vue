<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    label="NOTIFICATION SOUND"
    accessible-name="Toggle the notification blip sound"
    namespace="app"
    setting-key="notificationSound"
    :hydrate-from-db="app.hydrateNotificationSoundFromDb"
    :read-from-store="() => app.notificationSound"
    :mirror-to-store="app.setNotificationSound"
    @stage="emit('stage', $event)"
  />
</template>
