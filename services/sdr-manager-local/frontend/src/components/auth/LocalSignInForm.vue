<template>
  <form class="sdr-devices-accordion" @submit.prevent="submit">
    <p class="local-sign-in-note">
      This machine’s SDR Manager has a console password. Sign in to manage its SDRs.
    </p>
    <BaseTextField
      ref="passwordInput"
      v-model="password"
      label="PASSWORD"
      input-id="sdr-manager-local-sign-in-password"
      :error="auth.errorMessage ?? ''"
      density="settings"
      layout="inline"
      input-type="password"
      autocomplete="current-password"
      required
    />
    <div class="sdr-devices-form-actions">
      <BaseButton
        type="submit"
        variant="primary"
        class="sdr-devices-btn"
        :disabled="auth.submitting || password === ''"
      >
        {{ auth.submitting ? 'SIGNING IN…' : 'SIGN IN' }}
      </BaseButton>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * `LocalSignInForm` — exchanges the console password for a session cookie.
 * A wrong password keeps focus in the field with the API's reason under it.
 */
import { nextTick, ref } from 'vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import { useLocalAuthStore } from '../../stores/localAuthStore'

const auth = useLocalAuthStore()
const password = ref('')
const passwordInput = ref<{ focus: () => void } | null>(null)

async function submit(): Promise<void> {
  const signedIn = await auth.signIn(password.value)
  password.value = ''
  if (!signedIn) {
    await nextTick()
    passwordInput.value?.focus()
  }
}
</script>

<style scoped>
.local-sign-in-note {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink-secondary);
}
</style>
