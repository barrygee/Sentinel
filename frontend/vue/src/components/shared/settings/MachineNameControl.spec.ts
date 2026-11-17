import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(() => Promise.resolve()),
  getNamespace: vi.fn(() => Promise.resolve({ machineName: '' })),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import MachineNameControl from './MachineNameControl.vue'

enableAutoUnmount(afterEach)

async function mountControl(storedName = '') {
  vi.mocked(settingsApi.getNamespace).mockResolvedValue({ machineName: storedName })
  const wrapper = mount(MachineNameControl, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

const input = (wrapper: Awaited<ReturnType<typeof mountControl>>) =>
  wrapper.get('input[aria-label="Machine name"]')
const preview = (wrapper: Awaited<ReturnType<typeof mountControl>>) =>
  wrapper.get('.settings-machine-name-preview').text()

describe('MachineNameControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(settingsApi.put).mockClear()
    document.body.innerHTML = ''
  })

  it('shows the stored name, read from the settings API on mount', async () => {
    const wrapper = await mountControl('Home')
    expect((input(wrapper).element as HTMLInputElement).value).toBe('Home')
    expect(preview(wrapper)).toBe('Shown here as Home (This machine); other Sentinels see Home.')
  })

  it('previews just "This machine" while unnamed, and says nothing about other Sentinels', async () => {
    const wrapper = await mountControl()
    expect(preview(wrapper)).toBe('Shown here as This machine.')
  })

  it('caps the name at 64 characters', async () => {
    const wrapper = await mountControl()
    expect(input(wrapper).attributes('maxlength')).toBe('64')
  })

  it('previews the name as it is typed, before it is applied', async () => {
    const wrapper = await mountControl()
    await input(wrapper).setValue('  Shed ')
    expect(preview(wrapper)).toBe('Shown here as Shed (This machine); other Sentinels see Shed.')
  })

  it('stages the write for APPLY CHANGES and leaves every label alone until then', async () => {
    const wrapper = await mountControl('Home')
    await input(wrapper).setValue('Shed')

    expect(useAppStore().machineName).toBe('Home')
    expect(settingsApi.put).not.toHaveBeenCalled()
    const staged = wrapper.emitted('stage')!
    expect(staged).toHaveLength(1)

    await (staged[0]![0] as () => Promise<unknown>)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'machineName', 'Shed')
    expect(useAppStore().machineName).toBe('Shed')
    expect(useAppStore().thisMachineLabel).toBe('Shed (This machine)')
  })

  it('re-reads the name when the settings change underneath it (config upload)', async () => {
    const wrapper = await mountControl('Home')
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ machineName: 'Roof' })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect((input(wrapper).element as HTMLInputElement).value).toBe('Roof')
    expect(preview(wrapper)).toContain('Roof (This machine)')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountControl('Home')
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
