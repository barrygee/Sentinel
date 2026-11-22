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
    historyBytes: 412 * 1024 * 1024,
    databaseBytes: 790 * 1024 * 1024,
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
    expect((await mountLine()).text()).toBe(
      'Recording · 3.2 days kept · 412 MB of history (790 MB database)',
    )
    expect(fetchHistoryStatus).toHaveBeenCalledWith('air')
  })

  it.each([
    [
      { enabled: false, oldestMs: null, newestMs: null, historyBytes: 0, databaseBytes: 2048 },
      'Not recording · nothing kept yet · 0 KB of history (2 KB database)',
    ],
    [
      { oldestMs: 0, newestMs: 60 * 60 * 1000, historyBytes: 100, databaseBytes: 100 },
      'Recording · under 2 hours kept · 1 KB of history (1 KB database)',
    ],
    [
      { historyBytes: 1.2 * 1024 ** 3, databaseBytes: 3.5 * 1024 ** 3 },
      'Recording · 3.2 days kept · 1.2 GB of history (3.5 GB database)',
    ],
    [
      { tleVersions: 12, samples: undefined, historyBytes: 8192, databaseBytes: 94_208 },
      'Recording · 3.2 days kept · 12 orbit versions · 8 KB of history (92 KB database)',
    ],
    // The database can't measure one table: show only what it can.
    [{ historyBytes: null }, 'Recording · 3.2 days kept · 790 MB database'],
    [{ historyBytes: undefined }, 'Recording · 3.2 days kept · 790 MB database'],
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
