import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../api/sdrManagerLocalApi'
import { authErrorMessage } from '../utils/errorMessages'

/**
 * This machine's console password, as the THIS MACHINE screens see it.
 *
 * The session is an `HttpOnly` cookie this code cannot read, so the API is
 * asked (`GET /auth/state`) whether a password exists and whether this browser
 * is signed in. The password itself is never kept here: it lives in a form
 * field for as long as it takes to send.
 */
export const useLocalAuthStore = defineStore('sdrManagerLocalAuth', () => {
  const loaded = ref(false)
  const passwordSet = ref(false)
  // Assumed until the API says otherwise, so an open console never flashes a
  // sign-in form it would take straight away again.
  const authenticated = ref(true)
  const updatedAt = ref(0)
  const minimumPasswordLength = ref(8)
  const submitting = ref(false)
  const errorMessage = ref<string | null>(null)

  /** A password exists and this browser is not signed in: every screen asks to sign in. */
  const mustSignIn = computed(() => passwordSet.value && !authenticated.value)
  /** No password: anyone who can reach this machine can change its SDRs. */
  const isUnprotected = computed(() => loaded.value && !passwordSet.value)

  /** Ask the API. A machine that can't answer leaves the screens to show their own errors. */
  async function refresh(): Promise<void> {
    try {
      const state = await api.getAuthState()
      passwordSet.value = state.password_set
      authenticated.value = state.authenticated
      updatedAt.value = state.updated_at
      minimumPasswordLength.value = state.minimum_password_length
    } catch {
      /* Left as it was: the devices list reports an unreachable machine far better. */
    }
    loaded.value = true
  }

  async function signIn(password: string): Promise<boolean> {
    submitting.value = true
    errorMessage.value = null
    try {
      await api.signIn(password)
    } catch (error) {
      errorMessage.value = authErrorMessage(error, 'That password is not correct.')
      return false
    } finally {
      submitting.value = false
    }
    await refresh()
    return true
  }

  async function signOut(): Promise<void> {
    try {
      await api.signOut()
    } finally {
      // Either way: only the API knows whether the cookie is gone.
      await refresh()
    }
  }

  /** Set the first password, or change it (`currentPassword` is then required). */
  async function setPassword(
    newPassword: string,
    currentPassword: string | null,
  ): Promise<boolean> {
    submitting.value = true
    errorMessage.value = null
    try {
      await api.setConsolePassword(newPassword, currentPassword)
    } catch (error) {
      errorMessage.value = authErrorMessage(error, 'That password could not be set.')
      return false
    } finally {
      submitting.value = false
    }
    await refresh()
    return true
  }

  /** A request came back 401: the session is gone. */
  function markSignedOut(): void {
    // Only meaningful with a password; on an open console a 401 would be a
    // server bug, and a sign-in form with nothing to sign in to would strand the operator.
    if (passwordSet.value) authenticated.value = false
  }

  function clearError(): void {
    errorMessage.value = null
  }

  return {
    loaded,
    passwordSet,
    authenticated,
    updatedAt,
    minimumPasswordLength,
    submitting,
    errorMessage,
    mustSignIn,
    isUnprotected,
    refresh,
    signIn,
    signOut,
    setPassword,
    markSignedOut,
    clearError,
  }
})
