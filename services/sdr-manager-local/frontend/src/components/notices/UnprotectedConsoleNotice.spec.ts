import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { NEW_PASSWORD_FIELD_ID } from '../auth/consolePasswordField'
import UnprotectedConsoleNotice from './UnprotectedConsoleNotice.vue'

describe('UnprotectedConsoleNotice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is absent until the auth state has been read', () => {
    expect(mount(UnprotectedConsoleNotice).find('.warning-notice').exists()).toBe(false)
  })

  it('is absent when a console password is set', () => {
    const auth = useLocalAuthStore()
    auth.loaded = true
    auth.passwordSet = true
    expect(mount(UnprotectedConsoleNotice).find('.warning-notice').exists()).toBe(false)
  })

  it('warns when the console has no password', () => {
    const auth = useLocalAuthStore()
    auth.loaded = true
    auth.passwordSet = false
    const wrapper = mount(UnprotectedConsoleNotice)
    expect(wrapper.get('.warning-notice').text()).toContain('no console password')
  })

  it('moves focus to the new-password field and scrolls it into view from SET A PASSWORD', async () => {
    const auth = useLocalAuthStore()
    auth.loaded = true
    const field = document.createElement('input')
    field.id = NEW_PASSWORD_FIELD_ID
    document.body.append(field)
    const scrollIntoView = vi.spyOn(field, 'scrollIntoView')
    const wrapper = mount(UnprotectedConsoleNotice)
    await wrapper.get('button').trigger('click')
    expect(document.activeElement).toBe(field)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('does nothing, and does not throw, when the password card is not on the page', async () => {
    useLocalAuthStore().loaded = true
    const wrapper = mount(UnprotectedConsoleNotice)
    await expect(wrapper.get('button').trigger('click')).resolves.toBeUndefined()
  })

  it('has no accessibility violations', async () => {
    useLocalAuthStore().loaded = true
    const wrapper = mount(UnprotectedConsoleNotice)
    expect(wrapper.get('button').text()).toBe('SET A PASSWORD')
    await expectNoAxeViolations(wrapper)
  })
})
