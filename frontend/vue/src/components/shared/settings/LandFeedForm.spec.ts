import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandFeedForm from './LandFeedForm.vue'
import type { FeedConfig } from '@/types/landFeeds'

vi.mock('@/services/landFeedsApi', () => ({
  listFeeds: vi.fn(),
  saveFeeds: vi.fn(),
  getCredentialStatus: vi.fn(),
  setCredential: vi.fn(),
  clearCredential: vi.fn(),
  testFeed: vi.fn(),
}))
import * as landFeedsApi from '@/services/landFeedsApi'

const DURHAM: FeedConfig = {
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
}

const TFL: FeedConfig = {
  id: 'tfl-jamcams',
  name: 'TfL JamCams',
  category: 'traffic-cameras',
  provider: 'tfl-jamcams',
  url: 'https://api.tfl.gov.uk',
  enabled: true,
  refreshSeconds: 300,
  datasets: ['jamcams'],
  bbox: null,
  location: null,
  auth: { type: 'apiKey', queryParam: 'app_key', optional: true },
}

async function mountForm(feed: FeedConfig | null) {
  const wrapper = mount(LandFeedForm, { props: { feed }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function fieldFor(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.find(`[aria-label="${label}"]`)
}

function lastSaveCall(
  wrapper: ReturnType<typeof mount>,
): [FeedConfig, (() => Promise<unknown>) | undefined] {
  const events = wrapper.emitted('save')!
  return events[events.length - 1] as [FeedConfig, (() => Promise<unknown>) | undefined]
}

describe('LandFeedForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(landFeedsApi.getCredentialStatus).mockResolvedValue({ configured: false })
    vi.mocked(landFeedsApi.setCredential).mockResolvedValue({ configured: true })
    vi.mocked(landFeedsApi.clearCredential).mockResolvedValue({ configured: false })
    vi.mocked(landFeedsApi.testFeed).mockResolvedValue({ ok: true, message: '', featureCount: 0 })
  })

  describe('new vs. existing feed', () => {
    it('shows an editable ID field for a brand-new feed, defaulting the provider to Durham', async () => {
      const wrapper = await mountForm(null)
      expect(fieldFor(wrapper, 'Feed id').exists()).toBe(true)
      expect((fieldFor(wrapper, 'Feed provider').element as HTMLSelectElement).value).toBe('durham')
    })

    it('shows the id as static text for an existing feed, and disables the provider field', async () => {
      const wrapper = await mountForm(DURHAM)
      expect(fieldFor(wrapper, 'Feed id').exists()).toBe(false)
      expect(wrapper.text()).toContain('durham-cc')
      expect((fieldFor(wrapper, 'Feed provider').element as HTMLSelectElement).disabled).toBe(true)
    })

    it('has no TEST control for a feed that does not exist yet', async () => {
      const wrapper = await mountForm(null)
      expect(wrapper.text()).not.toContain('TEST FEED')
    })
  })

  describe('provider-driven fields', () => {
    it('shows latitude/longitude only for a snapshot feed', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed provider').setValue('snapshot')
      expect(fieldFor(wrapper, 'Camera latitude').exists()).toBe(true)
      expect(fieldFor(wrapper, 'Camera longitude').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('APP KEY')
    })

    it('shows an optional API key field only for TfL JamCams', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed provider').setValue('tfl-jamcams')
      expect(wrapper.find('input[type="password"]').exists()).toBe(true)
      expect(fieldFor(wrapper, 'Camera latitude').exists()).toBe(false)
    })

    it('shows neither extra field for Durham', async () => {
      const wrapper = await mountForm(null)
      expect(fieldFor(wrapper, 'Camera latitude').exists()).toBe(false)
      expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    })
  })

  describe('write-only credential', () => {
    it("says the key is unset and doesn't offer CLEAR when the feed is new", async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed provider').setValue('tfl-jamcams')
      expect(wrapper.text()).toContain('Works anonymously without one')
      expect(wrapper.text()).not.toContain('CLEAR KEY')
    })

    it('shows a configured dot and CLEAR KEY when a JamCams key is already stored', async () => {
      vi.mocked(landFeedsApi.getCredentialStatus).mockResolvedValue({ configured: true })
      const wrapper = await mountForm(TFL)
      await flushPromises()
      expect(landFeedsApi.getCredentialStatus).toHaveBeenCalledWith('tfl-jamcams')
      expect(wrapper.text()).toContain('A key is stored — leave blank to keep it.')
      expect(wrapper.text()).toContain('CLEAR KEY')
    })

    it('never fetches credential status for a provider that has no credential', async () => {
      const wrapper = await mountForm(DURHAM)
      await flushPromises()
      expect(landFeedsApi.getCredentialStatus).not.toHaveBeenCalled()
      expect(wrapper.text()).not.toContain('CLEAR KEY')
    })

    it('CLEAR KEY blanks the field, drops the configured dot, and stages a clear only on save', async () => {
      vi.mocked(landFeedsApi.getCredentialStatus).mockResolvedValue({ configured: true })
      const wrapper = await mountForm(TFL)
      await flushPromises()
      await fieldFor(wrapper, 'Feed name').setValue('TfL JamCams')
      const button = wrapper
        .findAll('button')
        .find((candidate) => candidate.text() === 'CLEAR KEY')!
      await button.trigger('click')
      expect(wrapper.text()).not.toContain('CLEAR KEY')
      expect(landFeedsApi.clearCredential).not.toHaveBeenCalled() // deferred to APPLY, not immediate

      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      const [, credentialOp] = lastSaveCall(wrapper)
      expect(credentialOp).toBeDefined()
      await credentialOp!()
      expect(landFeedsApi.clearCredential).toHaveBeenCalledWith('tfl-jamcams')
    })

    it('stages a set-credential op when a new key is typed for an existing feed', async () => {
      const wrapper = await mountForm(TFL)
      await flushPromises()
      await wrapper.find('input[type="password"]').setValue('  my-app-key  ')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      const [, credentialOp] = lastSaveCall(wrapper)
      expect(credentialOp).toBeDefined()
      await credentialOp!()
      expect(landFeedsApi.setCredential).toHaveBeenCalledWith('tfl-jamcams', {
        apiKey: 'my-app-key',
      })
    })

    it('stages no credential op when the key field is left blank', async () => {
      const wrapper = await mountForm(TFL)
      await flushPromises()
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      const [, credentialOp] = lastSaveCall(wrapper)
      expect(credentialOp).toBeUndefined()
    })
  })

  describe('TEST', () => {
    it('runs the store probe against the existing feed and shows a success result', async () => {
      vi.mocked(landFeedsApi.testFeed).mockResolvedValue({
        ok: true,
        message: 'Reached upstream.',
        featureCount: 33,
      })
      const wrapper = await mountForm(DURHAM)
      const testButton = wrapper
        .findAll('button')
        .find((candidate) => candidate.text() === 'TEST FEED')!
      await testButton.trigger('click')
      await flushPromises()
      expect(landFeedsApi.testFeed).toHaveBeenCalledWith('durham-cc')
      expect(wrapper.text()).toContain('OK — Reached upstream.')
      expect(wrapper.text()).toContain('(33 features)')
    })

    it('shows a failure message without a feature count', async () => {
      vi.mocked(landFeedsApi.testFeed).mockResolvedValue({
        ok: false,
        message: 'HTTP 503.',
        featureCount: 0,
      })
      const wrapper = await mountForm(DURHAM)
      const testButton = wrapper
        .findAll('button')
        .find((candidate) => candidate.text() === 'TEST FEED')!
      await testButton.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('FAILED — HTTP 503.')
      expect(wrapper.text()).not.toContain('features)')
    })

    it('disables the button while the probe is in flight', async () => {
      let resolveTest: (value: {
        ok: boolean
        message: string
        featureCount: number
      }) => void = () => {}
      vi.mocked(landFeedsApi.testFeed).mockReturnValue(
        new Promise((resolve) => (resolveTest = resolve)),
      )
      const wrapper = await mountForm(DURHAM)
      const testButton = wrapper
        .findAll('button')
        .find((candidate) => candidate.text() === 'TEST FEED')!
      await testButton.trigger('click')
      expect((testButton.element as HTMLButtonElement).disabled).toBe(true)
      resolveTest({ ok: true, message: 'ok', featureCount: 1 })
      await flushPromises()
      expect((testButton.element as HTMLButtonElement).disabled).toBe(false)
    })
  })

  describe('validation', () => {
    it('rejects a malformed id for a new feed', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('A')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').text()).toContain('ID must be')
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('accepts the shortest valid id', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
      expect(wrapper.emitted('save')).toBeDefined()
    })

    it('requires a name', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Name is required.')
    })

    it('rejects a non-https URL', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('http://example.com')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe('URL must be https.')
    })

    it('requires latitude and longitude for a snapshot feed', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      await fieldFor(wrapper, 'Feed provider').setValue('snapshot')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
        'Latitude and longitude are required for a snapshot feed.',
      )
    })

    it('still rejects a snapshot feed when only the latitude is given', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      await fieldFor(wrapper, 'Feed provider').setValue('snapshot')
      await fieldFor(wrapper, 'Camera latitude').setValue('54.9')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').text()).toBe(
        'Latitude and longitude are required for a snapshot feed.',
      )
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('accepts a snapshot feed once both coordinates are given', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      await fieldFor(wrapper, 'Feed provider').setValue('snapshot')
      await fieldFor(wrapper, 'Camera latitude').setValue('54.9')
      await fieldFor(wrapper, 'Camera longitude').setValue('-1.6')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      const [feed] = lastSaveCall(wrapper)
      expect(feed.location).toEqual({ latitude: 54.9, longitude: -1.6 })
    })

    it('clears a previous error once the fix is saved successfully', async () => {
      const wrapper = await mountForm(null)
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(true)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      await saveButton.trigger('click')
      expect(wrapper.find('.sdr-devices-form-error').exists()).toBe(false)
    })
  })

  describe('save shape', () => {
    it("switching a new feed's provider re-applies that provider's default refresh interval", async () => {
      const wrapper = await mountForm(null)
      const refreshField = fieldFor(wrapper, 'Refresh interval in seconds')
      expect((refreshField.element as HTMLInputElement).value).toBe('60')
      await fieldFor(wrapper, 'Feed provider').setValue('tfl-jamcams')
      expect((refreshField.element as HTMLInputElement).value).toBe('300')
      await fieldFor(wrapper, 'Feed provider').setValue('durham')
      expect((refreshField.element as HTMLInputElement).value).toBe('60')
    })

    it("keeps an operator-typed refresh interval when the new feed's provider changes", async () => {
      const wrapper = await mountForm(null)
      const refreshField = fieldFor(wrapper, 'Refresh interval in seconds')
      await refreshField.setValue('90')
      await fieldFor(wrapper, 'Feed provider').setValue('tfl-jamcams')
      expect((refreshField.element as HTMLInputElement).value).toBe('90')
    })

    it('clamps the refresh interval into the 15-3600s range', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      await fieldFor(wrapper, 'Refresh interval in seconds').setValue('1')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(lastSaveCall(wrapper)[0].refreshSeconds).toBe(15)

      await fieldFor(wrapper, 'Refresh interval in seconds').setValue('999999')
      await saveButton.trigger('click')
      expect(lastSaveCall(wrapper)[0].refreshSeconds).toBe(3600)
    })

    it('keeps the existing id, datasets, bbox and auth unchanged when editing', async () => {
      const withBbox: FeedConfig = {
        ...DURHAM,
        bbox: [
          [-2, 54],
          [-1, 55],
        ],
      }
      const wrapper = await mountForm(withBbox)
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      const [feed] = lastSaveCall(wrapper)
      expect(feed.id).toBe('durham-cc')
      expect(feed.datasets).toEqual(['cameras'])
      expect(feed.bbox).toEqual(withBbox.bbox)
      expect(feed.auth).toEqual({ type: 'none' })
    })

    it('sets the default datasets/auth for a brand-new feed by provider', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      await fieldFor(wrapper, 'Feed provider').setValue('tfl-jamcams')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      const [feed] = lastSaveCall(wrapper)
      expect(feed.datasets).toEqual(['jamcams'])
      expect(feed.auth).toEqual({ type: 'apiKey', queryParam: 'app_key', optional: true })
    })

    it('always writes traffic-cameras as the category (the only one P0 forms edit)', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('Test')
      await fieldFor(wrapper, 'Feed URL').setValue('https://example.com')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(lastSaveCall(wrapper)[0].category).toBe('traffic-cameras')
    })

    it('trims the name and URL', async () => {
      const wrapper = await mountForm(null)
      await fieldFor(wrapper, 'Feed id').setValue('ab')
      await fieldFor(wrapper, 'Feed name').setValue('  Test  ')
      await fieldFor(wrapper, 'Feed URL').setValue('  https://example.com  ')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      const [feed] = lastSaveCall(wrapper)
      expect(feed.name).toBe('Test')
      expect(feed.url).toBe('https://example.com')
    })

    it('carries the enabled toggle through to the saved feed', async () => {
      const wrapper = await mountForm(DURHAM)
      const toggle = wrapper.find('[role="switch"]')
      await toggle.trigger('click')
      const saveButton = wrapper.findAll('button').find((candidate) => candidate.text() === 'SAVE')!
      await saveButton.trigger('click')
      expect(lastSaveCall(wrapper)[0].enabled).toBe(true) // DURHAM starts disabled
    })
  })

  it('emits cancel from the CANCEL button', async () => {
    const wrapper = await mountForm(DURHAM)
    const cancelButton = wrapper
      .findAll('button')
      .find((candidate) => candidate.text() === 'CANCEL')!
    await cancelButton.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('has no accessibility violations for a new and an existing feed', async () => {
    const newForm = await mountForm(null)
    expect(await axe(newForm.element)).toHaveNoViolations()
    const existingForm = await mountForm(DURHAM)
    expect(await axe(existingForm.element)).toHaveNoViolations()
  })
})
