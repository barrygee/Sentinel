import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SeaAisKeyControl from './SeaAisKeyControl.vue'

vi.mock('@/services/seaApi', () => ({
  getAisKeyStatus: vi.fn(),
  getFeedStatus: vi.fn(),
  putAisKey: vi.fn(),
  deleteAisKey: vi.fn(),
}))
import * as seaApi from '@/services/seaApi'

const UNSET = { configured: false, source: null, fingerprint: null } as const

async function mountControl() {
  const wrapper = mount(SeaAisKeyControl, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

async function runStaged(wrapper: ReturnType<typeof mount>, index = -1): Promise<void> {
  const staged = wrapper.emitted('stage')!
  const entry = staged.at(index)![0] as () => Promise<unknown> | void
  await entry()
  await flushPromises()
}

describe('SeaAisKeyControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(seaApi.getAisKeyStatus).mockResolvedValue({ ...UNSET })
    vi.mocked(seaApi.getFeedStatus).mockResolvedValue(null)
    vi.mocked(seaApi.putAisKey).mockResolvedValue({ ok: true })
    vi.mocked(seaApi.deleteAisKey).mockResolvedValue({ ok: true })
  })

  it('says when no key is configured and offers no forget button', async () => {
    const wrapper = await mountControl()
    expect(wrapper.text()).toContain('No key configured')
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('FORGET KEY')
    expect(wrapper.find('a.sea-key-link').attributes('href')).toBe('https://aisstream.io')
    wrapper.unmount()
  })

  it('reports an env key and the feed status without ever showing the key', async () => {
    vi.mocked(seaApi.getAisKeyStatus).mockResolvedValue({
      configured: true,
      source: 'env',
      fingerprint: 'abc123',
    })
    vi.mocked(seaApi.getFeedStatus).mockResolvedValue({ status: 'live' } as never)
    const wrapper = await mountControl()
    expect(wrapper.text()).toContain('Key abc123 configured (from the server .env). Feed: LIVE.')
    expect(wrapper.text()).not.toContain('FORGET KEY') // only a saved key can be forgotten
    wrapper.unmount()
  })

  it('copes with a configured key that has no fingerprint', async () => {
    vi.mocked(seaApi.getAisKeyStatus).mockResolvedValue({
      configured: true,
      source: 'settings',
      fingerprint: null,
    })
    const wrapper = await mountControl()
    expect(wrapper.text()).toContain('Key  configured (saved here).')
    wrapper.unmount()
  })

  it('stages the typed key for APPLY CHANGES and clears the field once saved', async () => {
    const wrapper = await mountControl()
    const input = wrapper.find('input[type="password"]')
    await input.setValue('  abcdefgh12345678  ')
    expect(wrapper.emitted('stage')).toHaveLength(1)
    vi.mocked(seaApi.getAisKeyStatus).mockResolvedValue({
      configured: true,
      source: 'settings',
      fingerprint: 'fp',
    })
    await runStaged(wrapper)
    expect(seaApi.putAisKey).toHaveBeenCalledWith('abcdefgh12345678')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('saved here')
    expect(wrapper.text()).toContain('FORGET KEY')
    wrapper.unmount()
  })

  it('stages nothing to write for a key that is too short', async () => {
    const wrapper = await mountControl()
    await wrapper.find('input[type="password"]').setValue('short')
    await runStaged(wrapper)
    expect(seaApi.putAisKey).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows the backend error when a save is rejected', async () => {
    vi.mocked(seaApi.putAisKey).mockResolvedValue({ ok: false, error: 'key must be…' })
    const wrapper = await mountControl()
    await wrapper.find('input[type="password"]').setValue('abcdefgh12345678')
    await runStaged(wrapper)
    expect(wrapper.find('[role="alert"]').text()).toBe('key must be…')
    wrapper.unmount()
  })

  it('Enter asks for an apply', async () => {
    const wrapper = await mountControl()
    await wrapper.find('input[type="password"]').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('stages forgetting a saved key, and shows an error if that fails', async () => {
    vi.mocked(seaApi.getAisKeyStatus).mockResolvedValue({
      configured: true,
      source: 'settings',
      fingerprint: 'fp',
    })
    const wrapper = await mountControl()
    await wrapper.find('button').trigger('click')
    vi.mocked(seaApi.getAisKeyStatus).mockResolvedValue({ ...UNSET })
    await runStaged(wrapper)
    expect(seaApi.deleteAisKey).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('No key configured')

    vi.mocked(seaApi.getAisKeyStatus).mockResolvedValue({
      configured: true,
      source: 'settings',
      fingerprint: 'fp',
    })
    vi.mocked(seaApi.deleteAisKey).mockResolvedValue({ ok: false, error: 'nope' })
    document.dispatchEvent(new CustomEvent('settings-panel-closed'))
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await runStaged(wrapper)
    expect(wrapper.find('[role="alert"]').text()).toBe('nope')
    wrapper.unmount()
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountControl()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
