import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import ConsolePasswordControl from './ConsolePasswordControl.vue'

vi.mock('../../api/sdrManagerLocalApi')

const CURRENT = '#sdr-manager-local-current-password'
const NEW_PASSWORD = '#sdr-manager-local-new-password'
const REPEAT = '#sdr-manager-local-repeat-password'
const UPDATED_AT = 1_700_000_000_000

function seedAuth(overrides: { passwordSet: boolean; authenticated?: boolean }): void {
  const auth = useLocalAuthStore()
  auth.loaded = true
  auth.passwordSet = overrides.passwordSet
  auth.authenticated = overrides.authenticated ?? true
  auth.updatedAt = UPDATED_AT
  auth.minimumPasswordLength = 10
  vi.mocked(api.getAuthState).mockResolvedValue({
    password_set: overrides.passwordSet,
    authenticated: overrides.authenticated ?? true,
    updated_at: UPDATED_AT,
    minimum_password_length: 10,
  })
}

async function fill(
  wrapper: VueWrapper,
  fields: { current?: string; next?: string; repeat?: string },
): Promise<void> {
  if (fields.current !== undefined) await wrapper.get(CURRENT).setValue(fields.current)
  if (fields.next !== undefined) await wrapper.get(NEW_PASSWORD).setValue(fields.next)
  if (fields.repeat !== undefined) await wrapper.get(REPEAT).setValue(fields.repeat)
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('ConsolePasswordControl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
  })

  describe('with no password set', () => {
    beforeEach(() => seedAuth({ passwordSet: false }))

    it('warns that the console is open, offers no CURRENT field and no SIGN OUT', () => {
      const wrapper = mount(ConsolePasswordControl)
      expect(wrapper.get('.console-password-note').text()).toContain('No password is set')
      expect(wrapper.find(CURRENT).exists()).toBe(false)
      expect(wrapper.text()).not.toContain('SIGN OUT')
      expect(wrapper.get('button[type="submit"]').text()).toBe('SAVE PASSWORD')
    })

    it('tells the operator the minimum length as a hint on the new password', () => {
      const wrapper = mount(ConsolePasswordControl)
      expect(wrapper.get(`${NEW_PASSWORD}-hint`).text()).toBe('At least 10 characters.')
    })

    it('refuses a too-short password without calling the API and focuses the field', async () => {
      const wrapper = mount(ConsolePasswordControl, { attachTo: document.body })
      await fill(wrapper, { next: 'short', repeat: 'short' })
      await submit(wrapper)
      expect(wrapper.get(`${NEW_PASSWORD}-error`).text()).toBe('Use at least 10 characters.')
      expect(wrapper.get(NEW_PASSWORD).attributes('aria-invalid')).toBe('true')
      expect(api.setConsolePassword).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(wrapper.get(NEW_PASSWORD).element)
      wrapper.unmount()
    })

    it('refuses a password the repeat does not match and focuses the repeat field', async () => {
      const wrapper = mount(ConsolePasswordControl, { attachTo: document.body })
      await fill(wrapper, { next: 'correct-horse-battery', repeat: 'correct-horse-batter' })
      await submit(wrapper)
      expect(wrapper.get(`${REPEAT}-error`).text()).toBe('The two passwords don’t match.')
      expect(api.setConsolePassword).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(wrapper.get(REPEAT).element)
      wrapper.unmount()
    })

    it('does not report a mismatch while the new password itself is too short', async () => {
      const wrapper = mount(ConsolePasswordControl)
      await fill(wrapper, { next: 'short', repeat: 'different' })
      await submit(wrapper)
      expect(wrapper.find(`${REPEAT}-error`).exists()).toBe(false)
    })

    it('sets the first password with no current one, clears the fields and announces it', async () => {
      vi.mocked(api.setConsolePassword).mockResolvedValue(undefined)
      const wrapper = mount(ConsolePasswordControl)
      await fill(wrapper, { next: 'correct-horse-battery', repeat: 'correct-horse-battery' })
      await submit(wrapper)
      expect(api.setConsolePassword).toHaveBeenCalledWith('correct-horse-battery', null)
      expect((wrapper.get(NEW_PASSWORD).element as HTMLInputElement).value).toBe('')
      expect((wrapper.get(REPEAT).element as HTMLInputElement).value).toBe('')
      expect(useLocalSdrStore().announcement).toBe('Password set.')
    })

    it('shows the API refusal in an alert, clears the fields and focuses the new password', async () => {
      vi.mocked(api.setConsolePassword).mockRejectedValue(
        new SdrManagerApiError(422, 'password_too_weak', 'That password is too common.'),
      )
      const wrapper = mount(ConsolePasswordControl, { attachTo: document.body })
      await fill(wrapper, { next: 'password123456', repeat: 'password123456' })
      await submit(wrapper)
      expect(wrapper.get('[role="alert"]').text()).toBe('That password is too common.')
      expect((wrapper.get(NEW_PASSWORD).element as HTMLInputElement).value).toBe('')
      expect(document.activeElement).toBe(wrapper.get(NEW_PASSWORD).element)
      expect(useLocalSdrStore().announcement).toBe('')
      wrapper.unmount()
    })

    it('shows SAVING… and disables the button while the request is in flight', async () => {
      let finish: () => void = () => undefined
      vi.mocked(api.setConsolePassword).mockReturnValue(
        new Promise<void>((resolve) => (finish = resolve)),
      )
      const wrapper = mount(ConsolePasswordControl)
      await fill(wrapper, { next: 'correct-horse-battery', repeat: 'correct-horse-battery' })
      await wrapper.get('form').trigger('submit')
      const button = wrapper.get('button[type="submit"]')
      expect(button.text()).toBe('SAVING…')
      expect(button.attributes('disabled')).toBeDefined()
      finish()
      await flushPromises()
      expect(wrapper.get('button[type="submit"]').text()).toBe('SAVE PASSWORD')
    })

    it('has no accessibility violations, with and without errors', async () => {
      const wrapper = mount(ConsolePasswordControl)
      await expectNoAxeViolations(wrapper)
      await fill(wrapper, { next: 'short', repeat: 'x' })
      await submit(wrapper)
      await expectNoAxeViolations(wrapper)
    })
  })

  describe('with a password set', () => {
    beforeEach(() => seedAuth({ passwordSet: true }))

    it('says when it was last changed and that changing it signs everyone else out', () => {
      const wrapper = mount(ConsolePasswordControl)
      const note = wrapper.get('.console-password-note').text()
      expect(note).toContain(`Last changed ${new Date(UPDATED_AT).toLocaleString()}.`)
      expect(note).toContain('signs out every other browser')
    })

    it('asks for the current password and focuses it when it is missing', async () => {
      const wrapper = mount(ConsolePasswordControl, { attachTo: document.body })
      await fill(wrapper, { next: 'correct-horse-battery', repeat: 'correct-horse-battery' })
      await submit(wrapper)
      expect(wrapper.get(`${CURRENT}-error`).text()).toBe('Enter the current password.')
      expect(api.setConsolePassword).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(wrapper.get(CURRENT).element)
      wrapper.unmount()
    })

    it('changes the password with the current one, clears all three fields and announces it', async () => {
      vi.mocked(api.setConsolePassword).mockResolvedValue(undefined)
      const wrapper = mount(ConsolePasswordControl)
      await fill(wrapper, {
        current: 'old-password-1',
        next: 'correct-horse-battery',
        repeat: 'correct-horse-battery',
      })
      await submit(wrapper)
      expect(api.setConsolePassword).toHaveBeenCalledWith('correct-horse-battery', 'old-password-1')
      for (const selector of [CURRENT, NEW_PASSWORD, REPEAT]) {
        expect((wrapper.get(selector).element as HTMLInputElement).value).toBe('')
      }
      expect(useLocalSdrStore().announcement).toBe(
        'Password changed. Every other browser has been signed out.',
      )
    })

    it('focuses the current password after the API refuses it', async () => {
      vi.mocked(api.setConsolePassword).mockRejectedValue(
        new SdrManagerApiError(401, 'invalid_credentials', 'The current password is wrong.'),
      )
      const wrapper = mount(ConsolePasswordControl, { attachTo: document.body })
      await fill(wrapper, {
        current: 'wrong-password',
        next: 'correct-horse-battery',
        repeat: 'correct-horse-battery',
      })
      await submit(wrapper)
      expect(wrapper.get('[role="alert"]').text()).toBe('The current password is wrong.')
      expect(document.activeElement).toBe(wrapper.get(CURRENT).element)
      wrapper.unmount()
    })

    it('clears a previous API error when the form is submitted again', async () => {
      const auth = useLocalAuthStore()
      auth.errorMessage = 'An old refusal.'
      const wrapper = mount(ConsolePasswordControl)
      await submit(wrapper)
      expect(wrapper.text()).not.toContain('An old refusal.')
    })

    it('signs this browser out from SIGN OUT', async () => {
      vi.mocked(api.signOut).mockResolvedValue(undefined)
      const wrapper = mount(ConsolePasswordControl)
      const signOut = wrapper.findAll('button').find((button) => button.text() === 'SIGN OUT')
      expect(signOut).toBeDefined()
      await signOut!.trigger('click')
      await flushPromises()
      expect(api.signOut).toHaveBeenCalledTimes(1)
    })

    it('has no accessibility violations', async () => {
      await expectNoAxeViolations(mount(ConsolePasswordControl))
    })
  })

  it('hides the form behind the sign-in pointer while this browser is signed out', () => {
    seedAuth({ passwordSet: true, authenticated: false })
    const wrapper = mount(ConsolePasswordControl)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sign in under DEVICES above')
  })
})
