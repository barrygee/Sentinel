<template>
  <LocalAuthGate>
    <form class="sdr-devices-accordion" novalidate @submit.prevent="save">
      <p class="console-password-note">
        <template v-if="auth.passwordSet">
          Last changed {{ lastChanged }}. Changing it signs out every other browser, including one
          you no longer have.
        </template>
        <template v-else>
          No password is set: anyone who can reach this machine can change its SDRs. Other Sentinels
          that manage this machine sign in with it too.
        </template>
      </p>
      <LocalFormField
        v-if="auth.passwordSet"
        v-slot="{ describedBy, invalid }"
        label="CURRENT"
        :field-id="CURRENT_FIELD_ID"
        :error="errors.current"
      >
        <input
          :id="CURRENT_FIELD_ID"
          ref="currentInput"
          v-model="currentPassword"
          type="password"
          class="sdr-devices-form-input"
          autocomplete="current-password"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </LocalFormField>
      <LocalFormField
        v-slot="{ describedBy, invalid }"
        label="NEW PASSWORD"
        :field-id="NEW_PASSWORD_FIELD_ID"
        :hint="`At least ${auth.minimumPasswordLength} characters.`"
        :error="errors.new"
      >
        <input
          :id="NEW_PASSWORD_FIELD_ID"
          ref="newInput"
          v-model="newPassword"
          type="password"
          class="sdr-devices-form-input"
          autocomplete="new-password"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </LocalFormField>
      <LocalFormField
        v-slot="{ describedBy, invalid }"
        label="REPEAT IT"
        :field-id="REPEAT_FIELD_ID"
        :error="errors.repeat"
      >
        <input
          :id="REPEAT_FIELD_ID"
          ref="repeatInput"
          v-model="repeatPassword"
          type="password"
          class="sdr-devices-form-input"
          autocomplete="new-password"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </LocalFormField>
      <p v-if="auth.errorMessage" class="sdr-devices-form-error" role="alert">
        {{ auth.errorMessage }}
      </p>
      <div class="sdr-devices-form-actions">
        <BaseButton
          v-if="auth.passwordSet"
          type="button"
          variant="ghost"
          class="sdr-devices-btn"
          @click="auth.signOut()"
        >
          SIGN OUT
        </BaseButton>
        <BaseButton
          type="submit"
          variant="primary"
          class="sdr-devices-btn"
          :disabled="auth.submitting"
        >
          {{ auth.submitting ? 'SAVING…' : 'SAVE PASSWORD' }}
        </BaseButton>
      </div>
    </form>
  </LocalAuthGate>
</template>

<script setup lang="ts">
/**
 * `ConsolePasswordControl` — the CONSOLE PASSWORD card: set this machine's
 * SDR Manager password, or change it, and sign this browser out.
 *
 * The password protects the SDR Manager API on both its addresses: this
 * Sentinel's own screens and other Sentinels managing this machine. The
 * fields are cleared the moment it is sent; nothing keeps it.
 */
import { computed, nextTick, reactive, ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import LocalFormField from '../shared/LocalFormField.vue'
import LocalAuthGate from './LocalAuthGate.vue'
import { NEW_PASSWORD_FIELD_ID } from './consolePasswordField'

const CURRENT_FIELD_ID = 'sdr-manager-local-current-password'
const REPEAT_FIELD_ID = 'sdr-manager-local-repeat-password'

const auth = useLocalAuthStore()
const devices = useLocalSdrStore()
const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const errors = reactive<{ current: string | null; new: string | null; repeat: string | null }>({
  current: null,
  new: null,
  repeat: null,
})
const currentInput = ref<HTMLInputElement | null>(null)
const newInput = ref<HTMLInputElement | null>(null)
const repeatInput = ref<HTMLInputElement | null>(null)

const lastChanged = computed(() => new Date(auth.updatedAt).toLocaleString())

function validate(): boolean {
  errors.current =
    auth.passwordSet && currentPassword.value === '' ? 'Enter the current password.' : null
  errors.new =
    newPassword.value.length < auth.minimumPasswordLength
      ? `Use at least ${auth.minimumPasswordLength} characters.`
      : null
  errors.repeat =
    errors.new === null && repeatPassword.value !== newPassword.value
      ? 'The two passwords don’t match.'
      : null
  return errors.current === null && errors.new === null && errors.repeat === null
}

async function focusFirstError(): Promise<void> {
  await nextTick()
  if (errors.current) currentInput.value?.focus()
  else if (errors.new) newInput.value?.focus()
  else if (errors.repeat) repeatInput.value?.focus()
  else (auth.passwordSet ? currentInput : newInput).value?.focus()
}

async function save(): Promise<void> {
  auth.clearError()
  if (!validate()) {
    await focusFirstError()
    return
  }
  const wasSet = auth.passwordSet
  const saved = await auth.setPassword(newPassword.value, wasSet ? currentPassword.value : null)
  currentPassword.value = ''
  newPassword.value = ''
  repeatPassword.value = ''
  if (saved) {
    devices.announce(
      wasSet ? 'Password changed. Every other browser has been signed out.' : 'Password set.',
    )
  } else {
    await focusFirstError()
  }
}
</script>

<style scoped>
.console-password-note {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  line-height: 1.5;
  color: var(--ink-secondary);
}
</style>
