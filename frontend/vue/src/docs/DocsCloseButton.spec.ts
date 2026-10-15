import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'

const closeDocs = vi.fn()
vi.mock('./composables/useDocsReturn', () => ({ useDocsReturn: () => ({ closeDocs }) }))

import DocsCloseButton from './DocsCloseButton.vue'

describe('DocsCloseButton', () => {
  it('is a button named "Close docs"', () => {
    const wrapper = mount(DocsCloseButton)
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Close docs')
    expect(button.attributes('data-tooltip')).toBe('CLOSE')
  })

  it('draws a decorative cross', () => {
    const wrapper = mount(DocsCloseButton)
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('closes the docs when pressed', async () => {
    closeDocs.mockClear()
    const wrapper = mount(DocsCloseButton)
    await wrapper.get('button').trigger('click')
    expect(closeDocs).toHaveBeenCalledTimes(1)
  })

  it('does not close until pressed', () => {
    closeDocs.mockClear()
    mount(DocsCloseButton)
    expect(closeDocs).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(DocsCloseButton)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
