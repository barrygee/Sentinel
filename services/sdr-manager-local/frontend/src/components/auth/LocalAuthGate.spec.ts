import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '../../api/sdrManagerLocalApi'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { makeAuthState } from '../../testing/factories'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import LocalAuthGate from './LocalAuthGate.vue'
import LocalSignInForm from './LocalSignInForm.vue'

vi.mock('../../api/sdrManagerLocalApi')

const SLOT_CONTENT = '<p class="protected">the protected card</p>'

describe('LocalAuthGate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState())
  })

  it('asks the API whether a password is set when the auth state has not been read yet', () => {
    mount(LocalAuthGate, { slots: { default: SLOT_CONTENT } })
    expect(api.getAuthState).toHaveBeenCalledTimes(1)
  })

  it('does not ask again once the auth state is loaded', () => {
    useLocalAuthStore().loaded = true
    mount(LocalAuthGate, { slots: { default: SLOT_CONTENT } })
    expect(api.getAuthState).not.toHaveBeenCalled()
  })

  it('shows its slot on an open console', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(
      makeAuthState({ password_set: false, authenticated: true }),
    )
    const wrapper = mount(LocalAuthGate, { slots: { default: SLOT_CONTENT } })
    await flushPromises()
    expect(wrapper.find('.protected').exists()).toBe(true)
  })

  it('shows its slot once signed in to a protected console', async () => {
    const wrapper = mount(LocalAuthGate, { slots: { default: SLOT_CONTENT } })
    await flushPromises()
    expect(wrapper.find('.protected').exists()).toBe(true)
  })

  it('hides its slot and shows the sign-in form when sign-in belongs here', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ authenticated: false }))
    const wrapper = mount(LocalAuthGate, {
      props: { signInHere: true },
      slots: { default: SLOT_CONTENT },
    })
    await flushPromises()
    expect(wrapper.find('.protected').exists()).toBe(false)
    expect(wrapper.findComponent(LocalSignInForm).exists()).toBe(true)
  })

  it('points to the devices card instead of a second sign-in form on the other cards', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ authenticated: false }))
    const wrapper = mount(LocalAuthGate, { slots: { default: SLOT_CONTENT } })
    await flushPromises()
    expect(wrapper.find('.protected').exists()).toBe(false)
    expect(wrapper.findComponent(LocalSignInForm).exists()).toBe(false)
    expect(wrapper.get('.sdr-devices-empty').text()).toBe(
      'Sign in under DEVICES above to manage this.',
    )
  })

  it('swaps the slot in when the browser signs in', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ authenticated: false }))
    const wrapper = mount(LocalAuthGate, { slots: { default: SLOT_CONTENT } })
    await flushPromises()
    expect(wrapper.find('.protected').exists()).toBe(false)
    useLocalAuthStore().authenticated = true
    await flushPromises()
    expect(wrapper.find('.protected').exists()).toBe(true)
  })

  it('has no accessibility violations in any of its three states', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ authenticated: false }))
    const signIn = mount(LocalAuthGate, {
      props: { signInHere: true },
      slots: { default: SLOT_CONTENT },
    })
    const pointer = mount(LocalAuthGate, { slots: { default: SLOT_CONTENT } })
    await flushPromises()
    await expectNoAxeViolations(signIn)
    await expectNoAxeViolations(pointer)
    useLocalAuthStore().authenticated = true
    await flushPromises()
    await expectNoAxeViolations(pointer)
  })
})
