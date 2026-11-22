import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import HistoryStatusLine from './HistoryStatusLine.vue'
import type { HistoryStatus } from './historyApi'

vi.mock('./historyApi', () => ({ fetchHistoryStatus: vi.fn() }))
import { fetchHistoryStatus } from './historyApi'

enableAutoUnmount(afterEach)

const DAY = 24 * 60 * 60 * 1000

function status(overrides: Partial<HistoryStatus> = {}): HistoryStatus {
  return {
    enabled: true,
    retentionDays: 7,
    oldestMs: 0,
    newestMs: 3.2 * DAY,
    samples: 100,
    databaseBytes: 412 * 1024 * 1024,
    ...overrides,
  }
}

async function mountLine() {
  const wrapper = mount(HistoryStatusLine, { props: { sectionId: 'air' }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('HistoryStatusLine', () => {
  beforeEach(() => {
    vi.mocked(fetchHistoryStatus).mockReset()
  })

  it('says it is checking until the status arrives', () => {
    vi.mocked(fetchHistoryStatus).mockReturnValue(new Promise(() => {}))
    const wrapper = mount(HistoryStatusLine, { props: { sectionId: 'air' } })
    expect(wrapper.text()).toBe('Checking what is recorded…')
  })

  it('summarises recording, days kept and size', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status())
    expect((await mountLine()).text()).toBe('Recording · 3.2 days kept · 412 MB on disk')
    expect(fetchHistoryStatus).toHaveBeenCalledWith('air')
  })

  it.each([
    [
      { enabled: false, oldestMs: null, newestMs: null, databaseBytes: 2048 },
      'Not recording · nothing kept yet · 2 KB on disk',
    ],
    [
      { oldestMs: 0, newestMs: 60 * 60 * 1000, databaseBytes: 100 },
      'Recording · under 2 hours kept · 1 KB on disk',
    ],
    [{ databaseBytes: 3.5 * 1024 ** 3 }, 'Recording · 3.2 days kept · 3.5 GB on disk'],
    [
      { tleVersions: 12, samples: undefined },
      'Recording · 3.2 days kept · 12 orbit versions · 412 MB on disk',
    ],
  ])('reads %j as %j', async (overrides, expected) => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status(overrides as Partial<HistoryStatus>))
    expect((await mountLine()).text()).toBe(expected)
  })

  it('says when the section cannot be reached', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(null)
    expect((await mountLine()).text()).toBe(
      'Recording status unavailable (the section service is not answering).',
    )
  })

  it('reads again after settings are applied', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status({ enabled: false }))
    const wrapper = await mountLine()
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status())
    document.dispatchEvent(new Event('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.text()).toMatch(/^Recording/)
    expect(fetchHistoryStatus).toHaveBeenCalledTimes(2)
  })

  it('is a polite live region with no axe violations', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status())
    const wrapper = await mountLine()
    expect(wrapper.get('p').attributes('aria-live')).toBe('polite')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})

afterEach(() => vi.restoreAllMocks())
