import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import PrivateAccessControl from './PrivateAccessControl.vue'

vi.mock('../../api/sdrManagerLocalApi')

enableAutoUnmount(afterEach)

const INPUT = '#sdr-manager-local-private-address'

function seedAuth(state: { passwordSet: boolean; authenticated?: boolean }): void {
  const auth = useLocalAuthStore()
  auth.loaded = true
  auth.passwordSet = state.passwordSet
  auth.authenticated = state.authenticated ?? true
}

async function mountControl(addresses: string[] = []): Promise<VueWrapper> {
  vi.mocked(api.getPrivateAccess).mockResolvedValue({ addresses })
  const wrapper = mount(PrivateAccessControl, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

async function submit(wrapper: VueWrapper, address: string): Promise<void> {
  await wrapper.get(INPUT).setValue(address)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('PrivateAccessControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('lists the allowed addresses', async () => {
    seedAuth({ passwordSet: true })
    const wrapper = await mountControl(['10.0.0.1', '10.0.0.2'])

    expect(wrapper.findAll('li').map((row) => row.text())).toEqual(['10.0.0.1', '10.0.0.2'])
  })

  it('shows no list when nobody is allowed', async () => {
    seedAuth({ passwordSet: true })
    const wrapper = await mountControl()

    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('says only the listed addresses get in, and why they must be fixed', async () => {
    seedAuth({ passwordSet: true })
    const wrapper = await mountControl()

    expect(wrapper.text()).toContain('Give each one a fixed IP address')
  })

  it('is a settings card whose note reads at the description size', async () => {
    seedAuth({ passwordSet: true })
    const wrapper = await mountControl()

    const card = wrapper.get('form.sdr-devices-accordion')
    expect(card.get('.sdr-devices-note').text()).toContain('Give each one a fixed IP address')
  })

  it('adds a valid address and empties the field', async () => {
    seedAuth({ passwordSet: true })
    vi.mocked(api.setPrivateAccess).mockResolvedValue({ addresses: ['192.168.1.20'] })
    const wrapper = await mountControl()

    await submit(wrapper, ' 192.168.1.20 ')

    expect(api.setPrivateAccess).toHaveBeenCalledWith(['192.168.1.20'])
    expect((wrapper.get(INPUT).element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('li').map((row) => row.text())).toEqual(['192.168.1.20'])
  })

  it('says what is wrong with a bad address, sends nothing and returns to the field', async () => {
    seedAuth({ passwordSet: true })
    const wrapper = await mountControl()

    await submit(wrapper, '192.168.1.0/24')

    expect(api.setPrivateAccess).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Enter one IP address')
    expect(wrapper.get(INPUT).attributes('aria-invalid')).toBe('true')
    // The complaint is the field's description, so a screen reader reads it with the field.
    const describedBy = wrapper.get(INPUT).attributes('aria-describedby')
    expect(wrapper.get(`#${describedBy}`).text()).toContain('Enter one IP address')
    expect(document.activeElement).toBe(wrapper.get(INPUT).element)
  })

  it('clears the complaint once the address is fixed', async () => {
    seedAuth({ passwordSet: true })
    vi.mocked(api.setPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.1'] })
    const wrapper = await mountControl()

    await submit(wrapper, 'nope')
    await submit(wrapper, '10.0.0.1')

    expect(wrapper.text()).not.toContain('Enter one IP address')
  })

  it('keeps what was typed when the host refuses it, and says why', async () => {
    seedAuth({ passwordSet: true })
    vi.mocked(api.setPrivateAccess).mockRejectedValue(
      new SdrManagerApiError(422, 'validation_error', 'That address can’t identify a Sentinel.'),
    )
    const wrapper = await mountControl()

    await submit(wrapper, '0.0.0.0')

    expect((wrapper.get(INPUT).element as HTMLInputElement).value).toBe('0.0.0.0')
    expect(wrapper.get('[role="alert"]').text()).toContain('identify a Sentinel')
  })

  it('removes an address and returns focus to the field', async () => {
    seedAuth({ passwordSet: true })
    vi.mocked(api.setPrivateAccess).mockResolvedValue({ addresses: [] })
    const wrapper = await mountControl(['10.0.0.1'])

    await wrapper.get('li button').trigger('click')
    await flushPromises()

    expect(api.setPrivateAccess).toHaveBeenCalledWith([])
    expect(wrapper.find('li').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get(INPUT).element)
  })

  it('shows the button as saving, and disables it, while a change is in flight', async () => {
    seedAuth({ passwordSet: true })
    vi.mocked(api.setPrivateAccess).mockReturnValue(new Promise(() => undefined))
    const wrapper = await mountControl()

    await wrapper.get(INPUT).setValue('10.0.0.1')
    await wrapper.get('form').trigger('submit')
    await wrapper.vm.$nextTick()

    const button = wrapper.get('button[type="submit"]')
    expect(button.text()).toBe('SAVING…')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('cannot be used until a console password is set, and says why', async () => {
    seedAuth({ passwordSet: false })
    const wrapper = await mountControl()

    expect(wrapper.text()).toContain('Set a console password first')
    expect(wrapper.get(INPUT).attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('asks for nothing while signed out, then loads once signed in', async () => {
    seedAuth({ passwordSet: true, authenticated: false })
    const wrapper = await mountControl(['10.0.0.1'])

    expect(api.getPrivateAccess).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(false)

    useLocalAuthStore().authenticated = true
    await flushPromises()

    expect(api.getPrivateAccess).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('li').map((row) => row.text())).toEqual(['10.0.0.1'])
  })

  it('has no axe violations with addresses and an error', async () => {
    seedAuth({ passwordSet: true })
    const wrapper = await mountControl(['10.0.0.1'])

    await submit(wrapper, 'nope')

    await expectNoAxeViolations(wrapper)
  })
})
