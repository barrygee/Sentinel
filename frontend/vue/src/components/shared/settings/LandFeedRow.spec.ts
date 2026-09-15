import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandFeedRow from './LandFeedRow.vue'
import LandFeedForm from './LandFeedForm.vue'
import type { FeedConfig } from '@/types/landFeeds'

vi.mock('@/services/landFeedsApi', () => ({
  listFeeds: vi.fn(),
  saveFeeds: vi.fn(),
  getCredentialStatus: vi.fn().mockResolvedValue({ configured: false }),
  setCredential: vi.fn(),
  clearCredential: vi.fn(),
  testFeed: vi.fn(),
}))

const DURHAM: FeedConfig = {
  id: 'durham-cc',
  name: 'Durham County Council',
  category: 'traffic-cameras',
  provider: 'durham',
  url: 'https://spatial.durham.gov.uk/example',
  enabled: true,
  refreshSeconds: 60,
  datasets: ['cameras'],
  bbox: null,
  location: null,
  auth: { type: 'none' },
}

const WEBCAM: FeedConfig = {
  ...DURHAM,
  id: 'roadside-cam',
  category: 'webcams',
  provider: 'snapshot',
  location: { latitude: 54.9, longitude: -1.6 },
}

function mountRow(props: Partial<InstanceType<typeof LandFeedRow>['$props']> = {}) {
  return mount(LandFeedRow, {
    props: {
      feed: DURHAM,
      status: null,
      open: false,
      confirming: false,
      ...props,
    },
  })
}

describe('LandFeedRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows the feed name, its category chip and provider label', () => {
    const wrapper = mountRow()
    expect(wrapper.text()).toContain('Durham County Council')
    expect(wrapper.text()).toContain('TRAFFIC CAMERAS')
    expect(wrapper.text()).toContain('Durham CC')
  })

  it('labels every category and provider combination P0 ships', () => {
    const webcamWrapper = mountRow({ feed: WEBCAM })
    expect(webcamWrapper.text()).toContain('WEBCAMS')
    expect(webcamWrapper.text()).toContain('Snapshot')

    const jamcamsWrapper = mountRow({ feed: { ...DURHAM, provider: 'tfl-jamcams' } })
    expect(jamcamsWrapper.text()).toContain('TfL JamCams')
  })

  it('emits toggle-edit when the edit button is clicked', async () => {
    const wrapper = mountRow()
    await wrapper.find('[aria-label="Edit feed"]').trigger('click')
    expect(wrapper.emitted('toggle-edit')).toHaveLength(1)
  })

  it('emits start-delete when the delete button is clicked', async () => {
    const wrapper = mountRow()
    await wrapper.find('[aria-label="Delete feed"]').trigger('click')
    expect(wrapper.emitted('start-delete')).toHaveLength(1)
  })

  it('shows a YES/NO confirm prompt instead of the edit/delete buttons while confirming', () => {
    const wrapper = mountRow({ confirming: true })
    expect(wrapper.find('[aria-label="Edit feed"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Delete feed"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('DELETE?')
  })

  it('emits confirm-delete and cancel-delete from the confirm prompt', async () => {
    const wrapper = mountRow({ confirming: true })
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    expect(wrapper.emitted('confirm-delete')).toHaveLength(1)
    await wrapper.find('.sdr-device-confirm-btn:not(.sdr-device-confirm-btn--yes)').trigger('click')
    expect(wrapper.emitted('cancel-delete')).toHaveLength(1)
  })

  it('renders the edit form only while open, and forwards its save/cancel events', async () => {
    const closed = mountRow({ open: false })
    expect(closed.findComponent(LandFeedForm).exists()).toBe(false)

    const wrapper = mountRow({ open: true })
    expect(wrapper.findComponent(LandFeedForm).exists()).toBe(true)
    const edited: FeedConfig = { ...DURHAM, name: 'Renamed' }
    const credentialOp = vi.fn()
    wrapper.findComponent(LandFeedForm).vm.$emit('save', edited, credentialOp)
    expect(wrapper.emitted('save')).toEqual([[edited, credentialOp]])
    wrapper.findComponent(LandFeedForm).vm.$emit('cancel')
    expect(wrapper.emitted('cancel-edit')).toHaveLength(1)
  })

  describe('status dot', () => {
    it('shows null (unknown) when the feed is disabled, regardless of status', () => {
      const wrapper = mountRow({
        feed: { ...DURHAM, enabled: false },
        status: { running: true, lastError: null },
      })
      // SdrSourceStatusDot renders a distinct class per state; null reads as
      // neither connected nor disconnected.
      expect(wrapper.find('.sdr-status-dot--connected').exists()).toBe(false)
      expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(false)
    })

    it('shows null (unknown) when no status has arrived yet', () => {
      const wrapper = mountRow({ feed: { ...DURHAM, enabled: true }, status: null })
      expect(wrapper.find('.sdr-status-dot--connected').exists()).toBe(false)
      expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(false)
    })

    it('shows disconnected when the last poll reported an error, even if still marked running', () => {
      const wrapper = mountRow({
        feed: { ...DURHAM, enabled: true },
        status: { running: true, lastError: 'HTTP 503' },
      })
      expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(true)
    })

    it('shows connected when running with no error', () => {
      const wrapper = mountRow({
        feed: { ...DURHAM, enabled: true },
        status: { running: true, lastError: null },
      })
      expect(wrapper.find('.sdr-status-dot--connected').exists()).toBe(true)
    })

    it('shows disconnected when enabled but not running and no error yet reported', () => {
      const wrapper = mountRow({
        feed: { ...DURHAM, enabled: true },
        status: { running: false, lastError: null },
      })
      expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(true)
    })
  })

  it('has no accessibility violations open or closed', async () => {
    // Rendered in isolation outside the settings panel's landmark structure,
    // so the "region" rule (which only makes sense page-wide) is disabled —
    // the same allowance SettingRow.spec.ts and its siblings make.
    const closed = mountRow()
    expect(
      await axe(closed.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    const open = mountRow({ open: true })
    expect(await axe(open.element, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
