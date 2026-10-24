<template>
  <slot v-if="!auth.mustSignIn" />
  <LocalSignInForm v-else-if="signInHere" />
  <p v-else class="sdr-devices-empty">Sign in under DEVICES above to manage this.</p>
</template>

<script setup lang="ts">
/**
 * `LocalAuthGate` — shows its slot only while this browser may use this
 * machine's SDR Manager: always on an open console, once signed in when a
 * console password is set.
 *
 * Every THIS MACHINE card is wrapped in one, but only the devices card
 * (`signInHere`) shows the sign-in form; the others say where it is, so a
 * signed-out page has one password box rather than four.
 */
import { onMounted } from 'vue'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import LocalSignInForm from './LocalSignInForm.vue'

withDefaults(defineProps<{ signInHere?: boolean }>(), { signInHere: false })

const auth = useLocalAuthStore()

onMounted(() => {
  if (!auth.loaded) void auth.refresh()
})
</script>
