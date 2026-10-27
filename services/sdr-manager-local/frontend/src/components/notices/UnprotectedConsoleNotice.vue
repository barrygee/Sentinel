<template>
  <BaseWarningNotice
    v-if="auth.isUnprotected"
    message="This machine’s SDR Manager has no console password. Anyone who can reach it on the network can change its SDRs."
  >
    <template #action>
      <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="focusPasswordField">
        SET A PASSWORD
      </BaseButton>
    </template>
  </BaseWarningNotice>
</template>

<script setup lang="ts">
/**
 * `UnprotectedConsoleNotice` — the standing warning while no console password
 * is set. It has no dismissal: an open console is a condition, not news. Its
 * action moves focus to the CONSOLE PASSWORD card's new-password field.
 */
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { NEW_PASSWORD_FIELD_ID } from '../auth/consolePasswordField'

const auth = useLocalAuthStore()

function focusPasswordField(): void {
  const field = document.getElementById(NEW_PASSWORD_FIELD_ID)
  field?.scrollIntoView({ block: 'center' })
  field?.focus()
}
</script>
