import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DocsDisclosure from './DocsDisclosure.vue'

function mountDisclosure(options: { open?: boolean; collapseBelow?: 'tablet' | 'wide' } = {}) {
  const parentKeydown = vi.fn()
  const wrapper = mount(DocsDisclosure, {
    props: {
      label: 'Pages in Develop',
      collapseBelow: options.collapseBelow ?? 'tablet',
      open: options.open ?? false,
      'onUpdate:open': (value: boolean) => wrapper.setProps({ open: value }),
    },
    slots: { default: '<a href="#x">A link</a>' },
    attachTo: document.body,
  })
  document.body.addEventListener('keydown', parentKeydown)
  return { wrapper, parentKeydown }
}

describe('DocsDisclosure', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders a button with the label that controls the region holding the slot', () => {
    const { wrapper } = mountDisclosure()
    const button = wrapper.get('button')
    const region = wrapper.get('.doc-disclosure__region')
    expect(button.text()).toContain('Pages in Develop')
    expect(button.attributes('type')).toBe('button')
    expect(region.attributes('id')).toBeTruthy()
    expect(button.attributes('aria-controls')).toBe(region.attributes('id'))
    expect(region.text()).toBe('A link')
  })

  it('is collapsed by default', () => {
    const { wrapper } = mountDisclosure()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.doc-disclosure').classes()).not.toContain('doc-disclosure--open')
  })

  it('reflects being open', () => {
    const { wrapper } = mountDisclosure({ open: true })
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.doc-disclosure').classes()).toContain('doc-disclosure--open')
  })

  it('says which width it collapses below', () => {
    expect(
      mountDisclosure({ collapseBelow: 'tablet' }).wrapper.get('.doc-disclosure').classes(),
    ).toContain('doc-disclosure--tablet')
    expect(
      mountDisclosure({ collapseBelow: 'wide' }).wrapper.get('.doc-disclosure').classes(),
    ).toContain('doc-disclosure--wide')
  })

  it('toggles open and closed when the button is pressed', async () => {
    const { wrapper } = mountDisclosure()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true])
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
  })

  it('works without a parent listening (own state)', async () => {
    const wrapper = mount(DocsDisclosure, {
      props: { label: 'x', collapseBelow: 'wide' },
      slots: { default: 'content' },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
  })

  describe('Escape', () => {
    it('closes it, returns focus to the button and keeps the key from closing Docs', async () => {
      const { wrapper, parentKeydown } = mountDisclosure({ open: true })
      const link = wrapper.get('a').element
      link.focus()
      await wrapper.get('a').trigger('keydown', { key: 'Escape' })
      expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
      expect(document.activeElement).toBe(wrapper.get('button').element)
      expect(parentKeydown).not.toHaveBeenCalled()
    })

    it('does nothing when it is already closed, so Escape reaches the page', async () => {
      const { wrapper, parentKeydown } = mountDisclosure({ open: false })
      await wrapper.get('a').trigger('keydown', { key: 'Escape' })
      expect(wrapper.emitted('update:open')).toBeUndefined()
      expect(parentKeydown).toHaveBeenCalledTimes(1)
    })

    it('does nothing where the button is not shown (wide screens), so Escape reaches the page', async () => {
      const { wrapper, parentKeydown } = mountDisclosure({ open: true })
      ;(wrapper.get('button').element as HTMLElement).style.display = 'none'
      await wrapper.get('a').trigger('keydown', { key: 'Escape' })
      expect(wrapper.emitted('update:open')).toBeUndefined()
      expect(parentKeydown).toHaveBeenCalledTimes(1)
    })

    it('ignores other keys', async () => {
      const { wrapper } = mountDisclosure({ open: true })
      await wrapper.get('a').trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:open')).toBeUndefined()
    })
  })

  it('gives each disclosure its own region id', () => {
    const Pair = defineComponent({
      components: { DocsDisclosure },
      template:
        '<div><DocsDisclosure label="One" collapse-below="tablet">a</DocsDisclosure><DocsDisclosure label="Two" collapse-below="wide">b</DocsDisclosure></div>',
    })
    const wrapper = mount(Pair)
    const [first, second] = wrapper
      .findAll('.doc-disclosure__region')
      .map((region) => region.attributes('id'))
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })

  it('has no accessibility violations closed or open', async () => {
    const closed = mountDisclosure()
    expect(
      await axe(closed.wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    const open = mountDisclosure({ open: true })
    expect(
      await axe(open.wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
