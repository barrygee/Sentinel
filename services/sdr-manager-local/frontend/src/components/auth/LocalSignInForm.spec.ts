import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { makeAuthState } from '../../testing/factories'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import LocalSignInForm from './LocalSignInForm.vue'

vi.mock('../../api/sdrManagerLocalApi')

const PASSWORD_SELECTOR = '#sdr-manager-local-sign-in-password'

describe('LocalSignInForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState())
  })

  it('names its password field and keeps SIGN IN disabled while it is empty', () => {
    const wrapper = mount(LocalSignInForm)
    expect(wrapper.get(PASSWORD_SELECTOR).attributes('type')).toBe('password')
    expect(wrapper.get('label').text()).toBe('PASSWORD')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('enables SIGN IN once a password is typed', async () => {
    const wrapper = mount(LocalSignInForm)
    await wrapper.get(PASSWORD_SELECTOR).setValue('hunter2hunter2')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('sends the typed password and clears the field after a successful sign in', async () => {
    vi.mocked(api.signIn).mockResolvedValue(undefined)
    const wrapper = mount(LocalSignInForm)
    await wrapper.get(PASSWORD_SELECTOR).setValue('hunter2hunter2')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.signIn).toHaveBeenCalledWith('hunter2hunter2')
    expect((wrapper.get(PASSWORD_SELECTOR).element as HTMLInputElement).value).toBe('')
  })

  it('shows the API reason, clears the password and refocuses the field on a wrong password', async () => {
    vi.mocked(api.signIn).mockRejectedValue(
      new SdrManagerApiError(401, 'invalid_credentials', 'Wrong password.'),
    )
    const wrapper = mount(LocalSignInForm, { attachTo: document.body })
    await wrapper.get(PASSWORD_SELECTOR).setValue('nope')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.sdr-devices-form-error').text()).toBe('Wrong password.')
    const field = wrapper.get(PASSWORD_SELECTOR)
    expect(field.attributes('aria-invalid')).toBe('true')
    expect((field.element as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(field.element)
    wrapper.unmount()
  })

  it('does not steal focus after a successful sign in', async () => {
    vi.mocked(api.signIn).mockResolvedValue(undefined)
    const wrapper = mount(LocalSignInForm, { attachTo: document.body })
    await wrapper.get(PASSWORD_SELECTOR).setValue('hunter2hunter2')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(document.activeElement).not.toBe(wrapper.get(PASSWORD_SELECTOR).element)
    wrapper.unmount()
  })

  it('shows SIGNING IN… and disables the button while the request is in flight', async () => {
    let finish: () => void = () => undefined
    vi.mocked(api.signIn).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const wrapper = mount(LocalSignInForm)
    await wrapper.get(PASSWORD_SELECTOR).setValue('hunter2hunter2')
    await wrapper.get('form').trigger('submit')
    const button = wrapper.get('button[type="submit"]')
    expect(button.text()).toBe('SIGNING IN…')
    expect(button.attributes('disabled')).toBeDefined()
    expect(useLocalAuthStore().submitting).toBe(true)
    finish()
    await flushPromises()
    expect(wrapper.get('button[type="submit"]').text()).toBe('SIGN IN')
  })

  it('has no accessibility violations, including with an error showing', async () => {
    vi.mocked(api.signIn).mockRejectedValue(
      new SdrManagerApiError(401, 'invalid_credentials', 'Wrong password.'),
    )
    const wrapper = mount(LocalSignInForm)
    await expectNoAxeViolations(wrapper)
    await wrapper.get(PASSWORD_SELECTOR).setValue('nope')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await expectNoAxeViolations(wrapper)
  })
})
