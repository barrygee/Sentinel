import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import * as clipboard from './composables/useClipboardCopy'
import DocsCodeBlock from './DocsCodeBlock.vue'
import { useDocsStore } from './docsStore'

function mountBlock(props: { code?: string; language?: string } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(DocsCodeBlock, {
    props: { code: 'docker compose up', language: 'bash', ...props },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  return { wrapper, store: useDocsStore() }
}

describe('DocsCodeBlock', () => {
  let copy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    copy = vi.spyOn(clipboard, 'copyTextToClipboard').mockResolvedValue(true)
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    window.getSelection()?.removeAllRanges()
  })

  describe('structure', () => {
    it('shows the language caption and the code', () => {
      const { wrapper } = mountBlock({ code: 'a < b && c', language: 'bash' })
      expect(wrapper.get('.doc-code__language').text()).toBe('bash')
      expect(wrapper.get('pre code').text()).toBe('a < b && c')
    })

    it('prints code as text, never as markup', () => {
      const { wrapper } = mountBlock({ code: '<script>alert(1)</script><b>x</b>' })
      expect(wrapper.find('pre script').exists()).toBe(false)
      expect(wrapper.find('pre b').exists()).toBe(false)
      expect(wrapper.get('pre code').text()).toBe('<script>alert(1)</script><b>x</b>')
    })

    it('falls back to "code" when the fence has no language', () => {
      const { wrapper } = mountBlock({ language: '' })
      expect(wrapper.get('.doc-code__language').text()).toBe('code')
      expect(wrapper.get('pre').attributes('aria-label')).toBe('Code code')
    })

    it('makes the code a named, keyboard-focusable group so a long line can be scrolled', () => {
      const { wrapper } = mountBlock({ language: 'bash' })
      const pre = wrapper.get('pre')
      expect(pre.attributes('tabindex')).toBe('0')
      expect(pre.attributes('role')).toBe('group')
      expect(pre.attributes('aria-label')).toBe('bash code')
    })

    it('starts with a COPY button', () => {
      const { wrapper } = mountBlock()
      expect(wrapper.get('button').text()).toBe('COPY')
      expect(wrapper.get('button').attributes('type')).toBe('button')
    })
  })

  describe('copying', () => {
    it('copies exactly the code', async () => {
      const { wrapper } = mountBlock({ code: 'line one\nline two' })
      await wrapper.get('button').trigger('click')
      expect(copy).toHaveBeenCalledWith('line one\nline two')
    })

    it('says COPIED and announces it', async () => {
      const { wrapper, store } = mountBlock()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(wrapper.get('button').text()).toBe('COPIED')
      await vi.advanceTimersByTimeAsync(60)
      expect(store.announcement).toBe('Copied to clipboard')
    })

    it('goes back to COPY after two seconds, not before', async () => {
      const { wrapper } = mountBlock()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1999)
      expect(wrapper.get('button').text()).toBe('COPIED')
      await vi.advanceTimersByTimeAsync(1)
      expect(wrapper.get('button').text()).toBe('COPY')
    })

    it('restarts the two seconds when pressed again', async () => {
      const { wrapper } = mountBlock()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1500)
      await wrapper.get('button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1500)
      expect(wrapper.get('button').text()).toBe('COPIED')
      await vi.advanceTimersByTimeAsync(500)
      expect(wrapper.get('button').text()).toBe('COPY')
    })

    it('keeps keyboard focus on the COPY button', async () => {
      const { wrapper } = mountBlock()
      const button = wrapper.get('button').element
      button.focus()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(document.activeElement).toBe(button)
    })

    it('selects the code and says so when the browser will not give it the clipboard', async () => {
      copy.mockResolvedValue(false)
      const { wrapper, store } = mountBlock({ code: 'docker compose up' })
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(wrapper.get('button').text()).toBe('SELECT AND COPY')
      expect(window.getSelection()?.toString()).toBe('docker compose up')
      await vi.advanceTimersByTimeAsync(60)
      expect(store.announcement).toBe('Code selected. Press Control or Command and C to copy.')
    })

    it('goes back to COPY after the selection hint too', async () => {
      copy.mockResolvedValue(false)
      const { wrapper } = mountBlock()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      expect(wrapper.get('button').text()).toBe('COPY')
    })

    it('does not select anything when the copy worked', async () => {
      const { wrapper } = mountBlock()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(window.getSelection()?.toString()).toBe('')
    })

    it('replaces an earlier selection', async () => {
      copy.mockResolvedValue(false)
      document.body.insertAdjacentHTML('beforeend', '<p id="other">other text</p>')
      const range = document.createRange()
      range.selectNodeContents(document.getElementById('other') as HTMLElement)
      window.getSelection()?.addRange(range)
      const { wrapper } = mountBlock({ code: 'only this' })
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(window.getSelection()?.toString()).toBe('only this')
    })

    it('copes with a browser that has no selection API', async () => {
      copy.mockResolvedValue(false)
      vi.spyOn(window, 'getSelection').mockReturnValue(null)
      const { wrapper } = mountBlock()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(wrapper.get('button').text()).toBe('SELECT AND COPY')
    })

    it('stops its feedback timer when removed', async () => {
      const { wrapper } = mountBlock()
      await wrapper.get('button').trigger('click')
      await flushPromises()
      // Let the live region's own settling timer finish; only the 2 s feedback timer is left.
      await vi.advanceTimersByTimeAsync(100)
      expect(vi.getTimerCount()).toBe(1)
      wrapper.unmount()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('has no accessibility violations', async () => {
    vi.useRealTimers() // axe schedules with timers
    const { wrapper } = mountBlock()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations after copying', async () => {
    vi.useRealTimers() // axe schedules with timers
    const { wrapper } = mountBlock()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
