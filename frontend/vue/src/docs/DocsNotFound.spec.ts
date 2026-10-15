import { describe, it, expect, afterEach, vi } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import DocsNotFound from './DocsNotFound.vue'

function mountNotFound(requestedPath: string) {
  return mountWithRouter(DocsNotFound, { props: { requestedPath } })
}

describe('DocsNotFound', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('names the address that was asked for, as typed', async () => {
    const { wrapper } = await mountNotFound('use/sdr/record')
    expect(wrapper.get('code').text()).toBe('/doc/use/sdr/record')
  })

  it('shows the address as text, not markup', async () => {
    const { wrapper } = await mountNotFound('<img src=x onerror=alert(1)>')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('code').text()).toBe('/doc/<img src=x onerror=alert(1)>')
  })

  it('offers the welcome page', async () => {
    const { wrapper } = await mountNotFound('nope')
    const link = wrapper.get('a')
    expect(link.text()).toBe('Welcome to Sentinel')
    expect(link.attributes('href')).toBe('/doc/')
  })

  it('offers a search box with the last part of the address filled in as a first guess', async () => {
    const { wrapper } = await mountNotFound('use/sdr/record')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('record')
  })

  it('ignores a trailing slash when guessing', async () => {
    const { wrapper } = await mountNotFound('use/sdr/record/')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('record')
  })

  it('has no guess for an empty address', async () => {
    const { wrapper } = await mountNotFound('')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
  })

  it('has no guess for an address of only slashes', async () => {
    const { wrapper } = await mountNotFound('//')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
  })

  it('focuses the search box with the guess selected, ready to retype', async () => {
    const { wrapper } = await mountNotFound('nope')
    const input = wrapper.get('input').element as HTMLInputElement
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4])
  })

  it('is the second search on the page, so it is not a landmark and does not claim the / key', async () => {
    const { wrapper } = await mountNotFound('nope')
    expect(wrapper.find('[role="search"]').exists()).toBe(false)
    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    document.body.dispatchEvent(slash)
    expect(slash.defaultPrevented).toBe(false)
  })

  it('searches for what the reader types', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountNotFound('nope')
    await wrapper.get('input').setValue('recording')
    vi.advanceTimersByTime(150)
    expect(wrapper.emitted('search')).toEqual([['recording']])
  })

  it('searches for the guess when the reader presses Enter', async () => {
    const { wrapper } = await mountNotFound('use/record')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('search')).toEqual([['record']])
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountNotFound('use/record')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
