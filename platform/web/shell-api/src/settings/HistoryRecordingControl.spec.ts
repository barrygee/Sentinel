import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import HistoryRecordingControl from './HistoryRecordingControl.vue'
import { usePlaybackStore } from '../stores/playback'

vi.mock('../services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
vi.mock('../playback/historyApi', () => ({
  fetchHistoryStatus: vi.fn(async () => null),
  fetchHistoryCoverage: vi.fn(async () => null),
}))
import * as settingsApi from '../services/settingsApi'

enableAutoUnmount(afterEach)

async function mountControl() {
  const wrapper = mount(HistoryRecordingControl, {
    props: { sectionId: 'sea', sectionLabel: 'Sea' },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('HistoryRecordingControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(settingsApi.getNamespace).mockReset()
    vi.mocked(settingsApi.put).mockReset()
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('hydrates the section from its stored settings', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      historyEnabled: true,
      historyRetentionDays: 3,
    })
    const wrapper = await mountControl()
    expect(settingsApi.getNamespace).toHaveBeenCalledWith('sea')
    const playback = usePlaybackStore()
    expect(playback.sections.sea.historyEnabled).toBe(true)
    expect(playback.sections.sea.retentionDays).toBe(3)
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.text()).toContain('Recording')
  })

  it('an unreadable namespace hydrates as off', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    const wrapper = await mountControl()
    expect(usePlaybackStore().sections.sea.historyEnabled).toBe(false)
    expect(wrapper.get('[role="switch"]').attributes('aria-label')).toBe('Record Sea history')
    expect(wrapper.text()).toContain('Record')
  })

  it('the switch mirrors at once and stages the write for APPLY', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ historyEnabled: false })
    const wrapper = await mountControl()
    await wrapper.get('[role="switch"]').trigger('click')
    expect(usePlaybackStore().sections.sea.historyEnabled).toBe(true)
    expect(wrapper.get('[role="switch"]').attributes('aria-label')).toBe('Sea history recording on')
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<void>
    await staged()
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'historyEnabled', true)
  })

  it('days to keep are clamped to 1–7 when written', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      historyEnabled: true,
      historyRetentionDays: 7,
    })
    const wrapper = await mountControl()
    const daysField = wrapper.get('input[aria-label="Sea history: days to keep, 1 to 7"]')
    await daysField.setValue('9')
    expect(usePlaybackStore().sections.sea.retentionDays).toBe(7)
    const staged = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<void>
    await staged()
    expect(settingsApi.put).toHaveBeenCalledWith('sea', 'historyRetentionDays', 7)
    await daysField.setValue('2')
    const stagedAgain = wrapper.emitted('stage')!.at(-1)![0] as () => Promise<void>
    await stagedAgain()
    expect(settingsApi.put).toHaveBeenLastCalledWith('sea', 'historyRetentionDays', 2)
  })

  it('shows what is recorded under the settings', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({})
    const wrapper = await mountControl()
    expect(wrapper.text()).toContain('Recording status unavailable')
  })

  it('has no axe violations', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ historyEnabled: true })
    const wrapper = await mountControl()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
