<template>
  <form class="sdr-devices-accordion" @submit.prevent="submit">
    <p class="local-sign-in-note">
      This machine’s SDR Manager has a console password. Sign in to manage its SDRs.
    </p>
    <LocalFormField
      v-slot="{ describedBy, invalid }"
      label="PASSWORD"
      field-id="sdr-manager-local-sign-in-password"
      :error="auth.errorMessage"
    >
      <input
        id="sdr-manager-local-sign-in-password"
        ref="passwordInput"
        v-model="password"
        type="password"
        class="sdr-devices-form-input"
        autocomplete="current-password"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
        required
      />
    </LocalFormField>
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
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import LocalFormField from '../shared/LocalFormField.vue'

const auth = useLocalAuthStore()
const password = ref('')
const passwordInput = ref<HTMLInputElement | null>(null)

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
