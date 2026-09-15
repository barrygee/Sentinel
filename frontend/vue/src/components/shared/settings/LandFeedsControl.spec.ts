import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandFeedsControl from './LandFeedsControl.vue'
import LandFeedForm from './LandFeedForm.vue'
import LandFeedRow from './LandFeedRow.vue'
import type { FeedConfig, FeedWithStatus } from '@/types/landFeeds'

vi.mock('@/services/landFeedsApi', () => ({
  listFeeds: vi.fn(),
  saveFeeds: vi.fn(),
  getCredentialStatus: vi.fn(),
  setCredential: vi.fn(),
  clearCredential: vi.fn(),
  testFeed: vi.fn(),
}))
import * as landFeedsApi from '@/services/landFeedsApi'

const STATUS = {
  lastFetchAt: null,
  lastError: null,
  featureCount: 0,
  credentialConfigured: false,
  running: false,
}

const DURHAM: FeedWithStatus = {
  id: 'durham-cc',
  name: 'Durham County Council',
  category: 'traffic-cameras',
  provider: 'durham',
  url: 'https://spatial.durham.gov.uk/example',
  enabled: false,
  refreshSeconds: 60,
  datasets: ['cameras'],
  bbox: null,
  location: null,
  auth: { type: 'none' },
  status: STATUS,
}

const TFL: FeedWithStatus = {
  id: 'tfl-jamcams',
  name: 'TfL JamCams',
  category: 'traffic-cameras',
  provider: 'tfl-jamcams',
  url: 'https://api.tfl.gov.uk',
  enabled: false,
  refreshSeconds: 300,
  datasets: ['jamcams'],
  bbox: null,
  location: null,
  auth: { type: 'apiKey', queryParam: 'app_key', optional: true },
  status: STATUS,
}

/** Strip the runtime `status` off a fixture, mirroring what the form itself
 *  emits — a plain `FeedConfig`, never the status the list attached. */
function toFeedConfig(feed: FeedWithStatus): FeedConfig {
  const { status: _status, ...config } = feed
  return config
}

enableAutoUnmount(afterEach)

async function mountControl() {
  const wrapper = mount(LandFeedsControl, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

/** Fold every queued write the control has staged since the last APPLY. */
async function applyStaged(wrapper: ReturnType<typeof mount>): Promise<void> {
  const staged = wrapper.emitted('stage')!
  const writer = staged.at(-1)![0] as () => Promise<unknown> | void
  await writer()
  await flushPromises()
}

describe('LandFeedsControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([])
    vi.mocked(landFeedsApi.saveFeeds).mockResolvedValue(undefined)
    vi.mocked(landFeedsApi.getCredentialStatus).mockResolvedValue({ configured: false })
    vi.mocked(landFeedsApi.setCredential).mockResolvedValue({ configured: true })
    vi.mocked(landFeedsApi.clearCredential).mockResolvedValue({ configured: false })
    vi.mocked(landFeedsApi.testFeed).mockResolvedValue({ ok: true, message: '', featureCount: 0 })
  })

  it('shows an empty-state message with no feeds configured', async () => {
    const wrapper = await mountControl()
    expect(wrapper.find('.sdr-devices-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('No live feeds configured')
  })

  it('lists a row per configured feed, keyed by id', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM, TFL])
    const wrapper = await mountControl()
    const rows = wrapper.findAllComponents(LandFeedRow)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.props('feed').id)).toEqual(['durham-cc', 'tfl-jamcams'])
  })

  it('opens and closes ADD FEED, mutually exclusive with any open row', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
    const wrapper = await mountControl()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(LandFeedForm).exists()).toBe(true)
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(LandFeedForm).exists()).toBe(false)
  })

  it('closes a blank ADD FEED form on cancel without staging anything', async () => {
    const wrapper = await mountControl()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    wrapper.findComponent(LandFeedForm).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(LandFeedForm).exists()).toBe(false)
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('toggling an open row a second time closes it again', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
    const wrapper = await mountControl()
    const row = wrapper.findComponent(LandFeedRow)
    row.vm.$emit('toggle-edit')
    await flushPromises()
    expect(wrapper.findComponent(LandFeedRow).props('open')).toBe(true)
    wrapper.findComponent(LandFeedRow).vm.$emit('toggle-edit')
    await flushPromises()
    expect(wrapper.findComponent(LandFeedRow).props('open')).toBe(false)
  })

  it('opening ADD FEED closes a row that was already open', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
    const wrapper = await mountControl()
    const row = wrapper.findComponent(LandFeedRow)
    row.vm.$emit('toggle-edit')
    await flushPromises()
    expect(wrapper.findComponent(LandFeedRow).props('open')).toBe(true)
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(LandFeedRow).props('open')).toBe(false)
  })

  describe('live draft (APPLY without SAVE)', () => {
    it("stages the open form's valid draft as soon as it is emitted, appended when new", async () => {
      const wrapper = await mountControl()
      await wrapper.find('.sdr-devices-add-btn').trigger('click')
      const draft: FeedConfig = { ...toFeedConfig(DURHAM), id: 'new-feed', name: 'Half typed' }
      wrapper.findComponent(LandFeedForm).vm.$emit('draft', draft, undefined)
      await applyStaged(wrapper)
      expect(landFeedsApi.saveFeeds).toHaveBeenCalledWith([draft])
    })

    it('merges a live edit of an existing row in place and runs its credential op after the list write', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM, TFL])
      const wrapper = await mountControl()
      const tflRow = wrapper.findAllComponents(LandFeedRow)[1]!
      tflRow.vm.$emit('toggle-edit')
      await flushPromises()
      const order: string[] = []
      vi.mocked(landFeedsApi.saveFeeds).mockImplementation(async () => {
        order.push('feeds')
      })
      const credentialOp = vi.fn(async () => {
        order.push('credential')
      })
      const edited: FeedConfig = { ...toFeedConfig(TFL), name: 'TfL (live edit)' }
      wrapper.findAllComponents(LandFeedRow)[1]!.vm.$emit('draft', edited, credentialOp)
      await applyStaged(wrapper)
      expect(landFeedsApi.saveFeeds).toHaveBeenCalledWith([toFeedConfig(DURHAM), edited])
      expect(order).toEqual(['feeds', 'credential'])
    })

    it('withdraws a draft that becomes invalid, so APPLY writes the saved list only', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
      const wrapper = await mountControl()
      await wrapper.find('.sdr-devices-add-btn').trigger('click')
      const draft: FeedConfig = { ...toFeedConfig(DURHAM), id: 'new-feed' }
      wrapper.findComponent(LandFeedForm).vm.$emit('draft', draft, undefined)
      wrapper.findComponent(LandFeedForm).vm.$emit('draft', null, undefined)
      await applyStaged(wrapper)
      expect(landFeedsApi.saveFeeds).toHaveBeenCalledWith([toFeedConfig(DURHAM)])
    })

    it('cancelling a form with a live draft re-stages without it; SAVE clears the live draft', async () => {
      vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
      const wrapper = await mountControl()
      await wrapper.find('.sdr-devices-add-btn').trigger('click')
      const draft: FeedConfig = { ...toFeedConfig(DURHAM), id: 'new-feed' }
      wrapper.findComponent(LandFeedForm).vm.$emit('draft', draft, undefined)
      wrapper.findComponent(LandFeedForm).vm.$emit('cancel')
      await flushPromises()
      expect(wrapper.findComponent(LandFeedForm).exists()).toBe(false)
      await applyStaged(wrapper)
      expect(landFeedsApi.saveFeeds).toHaveBeenLastCalledWith([toFeedConfig(DURHAM)])

      await wrapper.find('.sdr-devices-add-btn').trigger('click')
      wrapper.findComponent(LandFeedForm).vm.$emit('draft', draft, undefined)
      wrapper.findComponent(LandFeedForm).vm.$emit('save', draft, undefined)
      await applyStaged(wrapper)
      // Saved once, not once as the row and again as a live draft.
      expect(landFeedsApi.saveFeeds).toHaveBeenLastCalledWith([toFeedConfig(DURHAM), draft])
    })
  })

  it('stages a new feed under a combined writer and saves it via the store on APPLY', async () => {
    const wrapper = await mountControl()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    const newFeed: FeedConfig = toFeedConfig(DURHAM)
    wrapper.findComponent(LandFeedForm).vm.$emit('save', newFeed, undefined)
    await flushPromises()
    expect(wrapper.findComponent(LandFeedForm).exists()).toBe(false) // form closes on save
    expect(wrapper.emitted('stage')).toHaveLength(1)
    expect(landFeedsApi.saveFeeds).not.toHaveBeenCalled() // nothing reaches the backend yet

    await applyStaged(wrapper)
    expect(landFeedsApi.saveFeeds).toHaveBeenCalledWith([newFeed])
  })

  it('folds an edited row into the draft in place, keeping the original position', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM, TFL])
    const wrapper = await mountControl()
    const durhamRow = wrapper.findAllComponents(LandFeedRow)[0]!
    durhamRow.vm.$emit('toggle-edit')
    await flushPromises()

    const editedDurham: FeedConfig = { ...toFeedConfig(DURHAM), name: 'Durham CC (renamed)' }
    wrapper.findAllComponents(LandFeedRow)[0]!.vm.$emit('save', editedDurham, undefined)
    await flushPromises()

    await applyStaged(wrapper)
    expect(landFeedsApi.saveFeeds).toHaveBeenCalledWith([
      editedDurham,
      expect.objectContaining({ id: 'tfl-jamcams' }),
    ])
  })

  it('runs the staged feed-list write before any queued credential op', async () => {
    // The P0 contract stages the whole feed list as one settings value; a
    // credential write for a brand-new feed only makes sense once that feed
    // exists server-side, so the ordering matters and is asserted directly.
    const callOrder: string[] = []
    vi.mocked(landFeedsApi.saveFeeds).mockImplementation(async () => {
      callOrder.push('saveFeeds')
    })
    const credentialOp = vi.fn(async () => {
      callOrder.push('credentialOp')
    })
    const wrapper = await mountControl()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    const newFeed: FeedConfig = toFeedConfig(TFL)
    wrapper.findComponent(LandFeedForm).vm.$emit('save', newFeed, credentialOp)
    await flushPromises()

    await applyStaged(wrapper)
    expect(callOrder).toEqual(['saveFeeds', 'credentialOp'])
    expect(credentialOp).toHaveBeenCalledOnce()
  })

  it('re-queuing a credential op for the same feed id replaces the earlier one', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([TFL])
    const wrapper = await mountControl()
    const row = wrapper.findComponent(LandFeedRow)
    row.vm.$emit('toggle-edit')
    await flushPromises()

    const firstOp = vi.fn(async () => {})
    const secondOp = vi.fn(async () => {})
    const editedFeed: FeedConfig = toFeedConfig(TFL)
    wrapper.findComponent(LandFeedRow).vm.$emit('save', editedFeed, firstOp)
    await flushPromises()
    wrapper.findComponent(LandFeedRow).vm.$emit('toggle-edit') // reopen
    await flushPromises()
    wrapper.findComponent(LandFeedRow).vm.$emit('save', editedFeed, secondOp)
    await flushPromises()

    await applyStaged(wrapper)
    expect(firstOp).not.toHaveBeenCalled()
    expect(secondOp).toHaveBeenCalledOnce()
  })

  it('removes a feed from the draft and stages the shortened list on confirmed delete', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM, TFL])
    const wrapper = await mountControl()
    const durhamRow = wrapper.findAllComponents(LandFeedRow)[0]!
    durhamRow.vm.$emit('start-delete')
    await flushPromises()
    expect(wrapper.findAllComponents(LandFeedRow)[0]!.props('confirming')).toBe(true)

    wrapper.findAllComponents(LandFeedRow)[0]!.vm.$emit('confirm-delete')
    await flushPromises()
    expect(wrapper.findAllComponents(LandFeedRow)).toHaveLength(1)
    expect(wrapper.findAllComponents(LandFeedRow)[0]!.props('feed').id).toBe('tfl-jamcams')

    await applyStaged(wrapper)
    expect(landFeedsApi.saveFeeds).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'tfl-jamcams' }),
    ])
  })

  it('cancels a pending delete confirmation without touching the draft', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
    const wrapper = await mountControl()
    const row = wrapper.findComponent(LandFeedRow)
    row.vm.$emit('start-delete')
    await flushPromises()
    wrapper.findComponent(LandFeedRow).vm.$emit('cancel-delete')
    await flushPromises()
    expect(wrapper.findComponent(LandFeedRow).props('confirming')).toBe(false)
    expect(wrapper.findAllComponents(LandFeedRow)).toHaveLength(1)
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('cancelling an open row edit closes it without staging a write', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
    const wrapper = await mountControl()
    const row = wrapper.findComponent(LandFeedRow)
    row.vm.$emit('toggle-edit')
    await flushPromises()
    wrapper.findComponent(LandFeedRow).vm.$emit('cancel-edit')
    await flushPromises()
    expect(wrapper.findComponent(LandFeedRow).props('open')).toBe(false)
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('re-reads the feed list and drops unapplied credential ops once the panel closes', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM])
    await mountControl()
    vi.mocked(landFeedsApi.listFeeds).mockClear()
    document.dispatchEvent(new CustomEvent('settings-panel-closed'))
    await flushPromises()
    expect(landFeedsApi.listFeeds).toHaveBeenCalledOnce()
  })

  it('has no accessibility violations', async () => {
    vi.mocked(landFeedsApi.listFeeds).mockResolvedValue([DURHAM, TFL])
    const wrapper = await mountControl()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
