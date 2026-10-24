import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import { makeAuthState } from '../testing/factories'
import { useLocalAuthStore } from './localAuthStore'

const api = vi.hoisted(() => ({
  getAuthState: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  setConsolePassword: vi.fn(),
}))
vi.mock('../api/sdrManagerLocalApi', () => api)

describe('localAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const mock of Object.values(api)) mock.mockReset()
    api.getAuthState.mockResolvedValue(makeAuthState())
  })

  it('starts optimistic: not loaded, assumed signed in, so no sign-in form flashes', () => {
    const auth = useLocalAuthStore()

    expect(auth.loaded).toBe(false)
    expect(auth.authenticated).toBe(true)
    expect(auth.mustSignIn).toBe(false)
    expect(auth.isUnprotected).toBe(false)
  })

  describe('refresh', () => {
    it('copies the API state and marks the store loaded', async () => {
      api.getAuthState.mockResolvedValue(
        makeAuthState({
          password_set: true,
          authenticated: false,
          updated_at: 42,
          minimum_password_length: 12,
        }),
      )
      const auth = useLocalAuthStore()

      await auth.refresh()

      expect(auth.passwordSet).toBe(true)
      expect(auth.authenticated).toBe(false)
      expect(auth.updatedAt).toBe(42)
      expect(auth.minimumPasswordLength).toBe(12)
      expect(auth.loaded).toBe(true)
      expect(auth.mustSignIn).toBe(true)
    })

    it('flags an unprotected console once loaded with no password', async () => {
      api.getAuthState.mockResolvedValue(makeAuthState({ password_set: false }))
      const auth = useLocalAuthStore()

      await auth.refresh()

      expect(auth.isUnprotected).toBe(true)
      expect(auth.mustSignIn).toBe(false)
    })

    it('keeps the previous state but still becomes loaded when the API cannot answer', async () => {
      api.getAuthState.mockRejectedValue(new Error('down'))
      const auth = useLocalAuthStore()

      await auth.refresh()

      expect(auth.loaded).toBe(true)
      expect(auth.passwordSet).toBe(false)
      expect(auth.authenticated).toBe(true)
      expect(auth.minimumPasswordLength).toBe(8)
    })
  })

  describe('signIn', () => {
    it('returns true, refreshes, and ends not submitting', async () => {
      api.signIn.mockResolvedValue(undefined)
      api.getAuthState.mockResolvedValue(makeAuthState({ authenticated: true }))
      const auth = useLocalAuthStore()

      await expect(auth.signIn('secret-pass')).resolves.toBe(true)

      expect(api.signIn).toHaveBeenCalledWith('secret-pass')
      expect(api.getAuthState).toHaveBeenCalledOnce()
      expect(auth.submitting).toBe(false)
      expect(auth.errorMessage).toBeNull()
    })

    it('shows the API message and returns false on a refusal, without refreshing', async () => {
      api.signIn.mockRejectedValue(new SdrManagerApiError(401, 'invalid', 'Wrong password'))
      const auth = useLocalAuthStore()

      await expect(auth.signIn('nope')).resolves.toBe(false)

      expect(auth.errorMessage).toBe('Wrong password')
      expect(auth.submitting).toBe(false)
      expect(api.getAuthState).not.toHaveBeenCalled()
    })

    it('uses the fallback sentence for a non-API failure', async () => {
      api.signIn.mockRejectedValue(new Error('boom'))
      const auth = useLocalAuthStore()

      await auth.signIn('nope')

      expect(auth.errorMessage).toBe('That password is not correct.')
    })

    it('is submitting while the request is in flight and clears a previous error', async () => {
      let finish: () => void = () => undefined
      api.signIn.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
      const auth = useLocalAuthStore()
      auth.errorMessage = 'old'

      const pending = auth.signIn('pw')

      expect(auth.submitting).toBe(true)
      expect(auth.errorMessage).toBeNull()
      finish()
      await pending
      expect(auth.submitting).toBe(false)
    })
  })

  describe('signOut', () => {
    it('signs out then refreshes', async () => {
      api.signOut.mockResolvedValue(undefined)
      api.getAuthState.mockResolvedValue(makeAuthState({ authenticated: false }))
      const auth = useLocalAuthStore()

      await auth.signOut()

      expect(api.signOut).toHaveBeenCalledOnce()
      expect(auth.authenticated).toBe(false)
    })

    it('refreshes even when sign-out fails, and rethrows', async () => {
      api.signOut.mockRejectedValue(new Error('down'))
      const auth = useLocalAuthStore()

      await expect(auth.signOut()).rejects.toThrow('down')

      expect(api.getAuthState).toHaveBeenCalledOnce()
    })
  })

  describe('setPassword', () => {
    it('sets the password, refreshes and returns true', async () => {
      api.setConsolePassword.mockResolvedValue(undefined)
      const auth = useLocalAuthStore()

      await expect(auth.setPassword('new-pass', 'old-pass')).resolves.toBe(true)

      expect(api.setConsolePassword).toHaveBeenCalledWith('new-pass', 'old-pass')
      expect(api.getAuthState).toHaveBeenCalledOnce()
      expect(auth.submitting).toBe(false)
    })

    it('shows the API message and returns false on a refusal', async () => {
      api.setConsolePassword.mockRejectedValue(
        new SdrManagerApiError(422, 'too_short', 'Too short'),
      )
      const auth = useLocalAuthStore()

      await expect(auth.setPassword('x', null)).resolves.toBe(false)

      expect(auth.errorMessage).toBe('Too short')
      expect(auth.submitting).toBe(false)
      expect(api.getAuthState).not.toHaveBeenCalled()
    })

    it('uses the fallback sentence for a non-API failure', async () => {
      api.setConsolePassword.mockRejectedValue(new Error('boom'))
      const auth = useLocalAuthStore()

      await auth.setPassword('x', null)

      expect(auth.errorMessage).toBe('That password could not be set.')
    })
  })

  describe('markSignedOut', () => {
    it('signs the browser out when a password is set', () => {
      const auth = useLocalAuthStore()
      auth.passwordSet = true

      auth.markSignedOut()

      expect(auth.authenticated).toBe(false)
      expect(auth.mustSignIn).toBe(true)
    })

    it('ignores a 401 on an open console, so the operator is never stranded', () => {
      const auth = useLocalAuthStore()
      auth.passwordSet = false

      auth.markSignedOut()

      expect(auth.authenticated).toBe(true)
    })
  })

  it('clearError drops the message', () => {
    const auth = useLocalAuthStore()
    auth.errorMessage = 'x'

    auth.clearError()

    expect(auth.errorMessage).toBeNull()
  })
})
