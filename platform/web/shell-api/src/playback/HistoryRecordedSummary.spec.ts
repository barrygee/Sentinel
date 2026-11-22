import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import HistoryRecordedSummary from './HistoryRecordedSummary.vue'
import type { HistoryStatus } from './historyApi'
import type { PlaybackSectionId } from './playbackSections'

vi.mock('./historyApi', () => ({ fetchHistoryStatus: vi.fn(), fetchHistoryCoverage: vi.fn() }))
import { fetchHistoryCoverage, fetchHistoryStatus } from './historyApi'

enableAutoUnmount(afterEach)

const MINUTE = 60_000
const BASE = Date.UTC(2026, 10, 18, 5, 0)

function status(overrides: Partial<HistoryStatus> = {}): HistoryStatus {
  return {
    enabled: true,
    retentionDays: 7,
    oldestMs: BASE,
    newestMs: BASE + 90 * MINUTE,
    samples: 100,
    historyBytes: 12 * 1024 ** 2,
    databaseBytes: 790 * 1024 ** 2,
    ...overrides,
  }
}

async function mountSummary(sectionId: PlaybackSectionId = 'air') {
  const wrapper = mount(HistoryRecordedSummary, { props: { sectionId }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function row(wrapper: Awaited<ReturnType<typeof mountSummary>>, term: string) {
  const rows = wrapper.findAll('.history-summary-row')
  return rows.find((candidate) => candidate.get('dt').text() === term)!.get('dd')
}

describe('HistoryRecordedSummary', () => {
  beforeEach(() => {
    vi.mocked(fetchHistoryStatus).mockReset()
    vi.mocked(fetchHistoryCoverage).mockReset()
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status())
    vi.mocked(fetchHistoryCoverage).mockResolvedValue({
      from: 0,
      to: 0,
      bucketMs: MINUTE,
      buckets: [
        [BASE, 10, 'online'],
        [BASE + MINUTE, 10, 'online'],
        [BASE + 60 * MINUTE, 4, 'offgrid'],
      ],
    })
  })

  it('says it is checking until the answers arrive', () => {
    vi.mocked(fetchHistoryStatus).mockReturnValue(new Promise(() => {}))
    expect(mount(HistoryRecordedSummary, { props: { sectionId: 'air' } }).text()).toBe(
      'Checking what is recorded…',
    )
  })

  it('shows recording, the time frames recorded and both sizes', async () => {
    const wrapper = await mountSummary()
    expect(fetchHistoryStatus).toHaveBeenCalledWith('air')
    expect(fetchHistoryCoverage).toHaveBeenCalledWith('air')
    expect(row(wrapper, 'STATUS').text()).toBe('Recording')
    const ranges = wrapper.findAll('.history-period-range').map((node) => node.text())
    expect(ranges).toEqual(['18 NOV 06:00 – 18 NOV 06:01 UTC', '18 NOV 05:00 – 18 NOV 05:02 UTC'])
    expect(row(wrapper, 'SIZE').text()).toBe('12 MB history · 790 MB database')
  })

  it('not recording, nothing yet, and an unmeasurable history size', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(
      status({
        enabled: false,
        oldestMs: null,
        newestMs: null,
        historyBytes: null,
        databaseBytes: 2048,
      }),
    )
    vi.mocked(fetchHistoryCoverage).mockResolvedValue(null)
    const wrapper = await mountSummary()
    expect(row(wrapper, 'STATUS').text()).toBe('Not recording')
    expect(row(wrapper, 'RECORDED').text()).toBe('Nothing recorded yet')
    expect(row(wrapper, 'SIZE').text()).toBe('2 KB database')
  })

  it('Space lists the span its orbit versions cover, without asking for coverage', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status({ tleVersions: 12, samples: undefined }))
    const wrapper = await mountSummary('space')
    expect(fetchHistoryCoverage).not.toHaveBeenCalled()
    expect(row(wrapper, 'RECORDED').text().replace(/\s+/g, ' ')).toBe(
      '12 orbit versions, 18 NOV 05:00 – 18 NOV 06:30 UTC',
    )
  })

  it('Space with nothing kept says so', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(
      status({ tleVersions: 0, oldestMs: null, newestMs: null }),
    )
    expect(row(await mountSummary('space'), 'RECORDED').text()).toBe('Nothing recorded yet')
  })

  it('says when the section cannot be reached', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(null)
    expect((await mountSummary()).text()).toBe(
      'Recording status unavailable (the section service is not answering).',
    )
  })

  it('reads again after settings are applied', async () => {
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status({ enabled: false }))
    const wrapper = await mountSummary()
    vi.mocked(fetchHistoryStatus).mockResolvedValue(status())
    document.dispatchEvent(new Event('sentinel:config-uploaded'))
    await flushPromises()
    expect(row(wrapper, 'STATUS').text()).toBe('Recording')
    expect(fetchHistoryStatus).toHaveBeenCalledTimes(2)
  })

  it('is a polite live definition list with no axe violations', async () => {
    const wrapper = await mountSummary()
    expect(wrapper.get('dl').attributes('aria-live')).toBe('polite')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
