<template>
  <LocalAuthGate>
    <form class="sdr-devices-accordion" novalidate @submit.prevent="addAddress">
      <p class="private-access-note">
        <template v-if="auth.passwordSet">
          Private dongles work on this machine and for the Sentinels listed here, and refuse
          everyone else. Use fixed addresses: whoever gets a listed address gets access.
        </template>
        <template v-else>Set a console password first, so nobody else can add themselves.</template>
      </p>
      <ul v-if="access.addresses.value.length > 0" class="private-access-list">
        <PrivateAccessRow
          v-for="address in access.addresses.value"
          :key="address"
          :address="address"
          :disabled="access.saving.value"
          @remove="removeAddress(address)"
        />
      </ul>
      <LocalFormField
        v-slot="{ describedBy, invalid }"
        label="IP ADDRESS"
        :field-id="ADDRESS_FIELD_ID"
        :error="addressError"
      >
        <input
          :id="ADDRESS_FIELD_ID"
          ref="addressInput"
          v-model="newAddress"
          type="text"
          class="sdr-devices-form-input"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="192.168.1.20"
          :disabled="!auth.passwordSet"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </LocalFormField>
      <p v-if="access.errorMessage.value" class="sdr-devices-form-error" role="alert">
        {{ access.errorMessage.value }}
      </p>
      <div class="sdr-devices-form-actions">
        <BaseButton
          type="submit"
          variant="primary"
          class="sdr-devices-btn"
          :disabled="!auth.passwordSet || access.saving.value"
        >
          {{ access.saving.value ? 'SAVING…' : 'ADD ADDRESS' }}
        </BaseButton>
      </div>
    </form>
  </LocalAuthGate>
</template>

<script setup lang="ts">
/**
 * `PrivateAccessControl` — the PRIVATE ACCESS card: the addresses of the other
 * Sentinels allowed to use this machine's private dongles. A change restarts
 * the private dongles' streams, which is what drops a Sentinel just removed.
 */
import { ref, useTemplateRef, watch } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import { usePrivateAccess } from '../../composables/usePrivateAccess'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { validateIpAddress } from '../../utils/validation'
import LocalAuthGate from '../auth/LocalAuthGate.vue'
import LocalFormField from '../shared/LocalFormField.vue'
import PrivateAccessRow from './PrivateAccessRow.vue'

const ADDRESS_FIELD_ID = 'sdr-manager-local-private-address'

const auth = useLocalAuthStore()
const access = usePrivateAccess()
const addressInput = useTemplateRef<HTMLInputElement>('addressInput')
const newAddress = ref('')
const addressError = ref<string | null>(null)

// Also after signing in, which can happen on another card with this one open.
watch(
  () => auth.mustSignIn,
  (mustSignIn) => {
    if (!mustSignIn) void access.load()
  },
  { immediate: true },
)

async function addAddress(): Promise<void> {
  const address = newAddress.value.trim()
  addressError.value = validateIpAddress(address)
  if (addressError.value !== null) {
    addressInput.value?.focus()
    return
  }
  if (await access.add(address)) newAddress.value = ''
}

/** Focus returns to the field, as the button that was pressed has just gone. */
async function removeAddress(address: string): Promise<void> {
  await access.remove(address)
  addressInput.value?.focus()
}
</script>

<style scoped>
.private-access-note {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink-secondary);
}

.private-access-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
