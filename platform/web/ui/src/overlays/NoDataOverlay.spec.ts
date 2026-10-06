import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import NoDataOverlay from './NoDataOverlay.vue'

function mountOverlay(props: Partial<{ domain: string; title: string; message: string }> = {}) {
  return mount(NoDataOverlay, {
    props: { domain: 'sea', title: 'No data.', message: 'Configure something.', ...props },
    attachTo: document.body,
  })
}

describe('NoDataOverlay', () => {
  afterEach(() => {
    delete document.body.dataset.noData
  })

  it('renders the domain accent, title, message and settings action', () => {
    const wrapper = mountOverlay({ domain: 'air' })
    expect(wrapper.find('.no-url-overlay-title-accent').text()).toBe('AIR')
    expect(wrapper.find('.no-url-overlay-title-main').text()).toBe('No data.')
    expect(wrapper.find('.no-url-overlay-msg').text()).toBe('Configure something.')
    expect(wrapper.find('.no-url-overlay-btn').text()).toContain('OPEN SETTINGS')
    wrapper.unmount()
  })

  it('emits openSettings when the button is clicked', async () => {
    const wrapper = mountOverlay()
    await wrapper.find('.no-url-overlay-btn').trigger('click')
    expect(wrapper.emitted('openSettings')).toHaveLength(1)
    wrapper.unmount()
  })

  it('hides the map chrome while mounted, ref-counted across overlays', () => {
    const first = mountOverlay()
    expect(document.body.dataset.noData).toBe('true')
    const second = mountOverlay()
    first.unmount()
    // One overlay is still up, so the chrome stays hidden.
    expect(document.body.dataset.noData).toBe('true')
    second.unmount()
    expect(document.body.dataset.noData).toBeUndefined()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountOverlay()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
