<script setup lang="ts">
import BaseToggleSetting from '@/components/base/BaseToggleSetting.vue'
import { computed } from 'vue'
import { useAppStore } from '@sentinel/shell-api/stores/app'

const app = useAppStore()
// Off, the caption offers to turn the sound on; on, it confirms it is on.
// The store mirrors the toggle immediately, so it tracks the switch in real time.
const toggleCaption = computed(() => (app.notificationSound ? 'Enabled' : 'Enable'))
// The one-word caption relies on the section title for context, which a screen
// reader landing on the switch doesn't get — so the name spells it out, while
// still containing the visible word (WCAG 2.5.3 label in name).
const toggleAccessibleName = computed(() =>
  app.notificationSound ? 'Alert sound enabled' : 'Enable alert sound',
)
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()
</script>

<template>
  <BaseToggleSetting
    :label="toggleCaption"
    :accessible-name="toggleAccessibleName"
    namespace="app"
    setting-key="notificationSound"
    :hydrate-from-db="app.hydrateNotificationSoundFromDb"
    :read-from-store="() => app.notificationSound"
    :mirror-to-store="app.setNotificationSound"
    @stage="emit('stage', $event)"
  />
</template>
