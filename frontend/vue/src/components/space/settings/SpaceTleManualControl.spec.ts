import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SpaceTleManualControl from './SpaceTleManualControl.vue'

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok, statusText: 'Bad', json: async () => payload })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Deterministic FileReader: resolves onload from the Blob's own text() so the
// read settles on a microtask that flushPromises can await.
class MockFileReader {
  onload: ((ev: { target: { result: string } }) => void) | null = null
  readAsText(file: Blob): void {
    void file.text().then((text) => this.onload?.({ target: { result: text } }))
  }
}

/** Set a file on the input and fire change, then wait for the FileReader. */
async function selectFile(wrapper: ReturnType<typeof mount>, text: string, name = 'sats.tle') {
  const input = wrapper.find('input[type="file"]')
  const file = new File([text], name, { type: 'text/plain' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

describe('SpaceTleManualControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubFetch({ total: 5, inserted: 3, updated: 2 })
    vi.stubGlobal('FileReader', MockFileReader)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with no file chosen and the update button disabled', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    expect(wrapper.find('.tle-file-name').text()).toBe('No file selected')
    expect(wrapper.find('.tle-action-btn--primary').attributes('disabled')).toBeDefined()
  })

  it('selects a category from the dropdown', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await wrapper.find('.tle-dropdown-selected').trigger('mousedown')
    const military = wrapper.findAll('.tle-dropdown-item').find((i) => i.text() === 'Military')!
    await military.trigger('mousedown')
    expect(wrapper.find('.tle-dropdown-selected-text').text()).toBe('Military')
    expect(wrapper.find('.tle-dropdown--open').exists()).toBe(false)
  })

  it('closes the dropdown on blur', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await wrapper.find('.tle-dropdown-selected').trigger('mousedown')
    expect(wrapper.find('.tle-dropdown--open').exists()).toBe(true)
    await wrapper.find('.tle-dropdown').trigger('blur')
    expect(wrapper.find('.tle-dropdown--open').exists()).toBe(false)
  })

  it('ignores a change event with no file', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [], configurable: true })
    await input.trigger('change')
    expect(wrapper.find('.tle-file-name').text()).toBe('No file selected')
  })

  it('reads the chosen file and enables the update button', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await selectFile(wrapper, 'ISS\n1 25544U\n2 25544')
    expect(wrapper.find('.tle-file-name').text()).toBe('sats.tle')
    expect(wrapper.find('.tle-action-btn--primary').attributes('disabled')).toBeUndefined()
  })

  it('treats a null read result as empty text', async () => {
    class NullFileReader {
      onload: ((ev: { target: { result: null } }) => void) | null = null
      readAsText(): void {
        void Promise.resolve().then(() => this.onload?.({ target: { result: null } }))
      }
    }
    vi.stubGlobal('FileReader', NullFileReader)
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await selectFile(wrapper, 'ignored')
    // The file name is recorded but the empty read leaves UPDATE TLE disabled.
    expect(wrapper.find('.tle-file-name').text()).toBe('sats.tle')
    expect(wrapper.find('.tle-action-btn--primary').attributes('disabled')).toBeDefined()
  })

  it('uploads the TLE text and reports the result', async () => {
    const refresh = vi.fn()
    document.addEventListener('tle:refreshStatus', refresh)
    const fetchMock = stubFetch({ total: 5, inserted: 3, updated: 2 })
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await selectFile(wrapper, 'ISS\n1 25544U\n2 25544')
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/space/tle/manual',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.find('.tle-status-badge').text()).toContain('5 satellites processed')
    expect(wrapper.find('.tle-file-name').text()).toBe('No file selected')
    expect(refresh).toHaveBeenCalled()
    document.removeEventListener('tle:refreshStatus', refresh)
  })

  it('reports zero counts when the response omits them', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await selectFile(wrapper, 'data')
    stubFetch({}, true)
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-status-badge').text()).toBe(
      '0 satellites processed · 0 new · 0 updated',
    )
  })

  it('falls back to the status text when the error response has no message', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await selectFile(wrapper, 'data')
    stubFetch({}, false)
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-status-badge--error').text()).toBe('Error: Bad')
  })

  it('reports an error returned by the backend', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    await selectFile(wrapper, 'data')
    stubFetch({ error: 'bad TLE' }, false)
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-status-badge--error').text()).toBe('Error: bad TLE')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SpaceTleManualControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
