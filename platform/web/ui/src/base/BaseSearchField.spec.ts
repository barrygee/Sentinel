import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseSearchField from './BaseSearchField.vue'

enableAutoUnmount(afterEach)

/** Mounts the field with a working v-model round trip (the parent owns the value). */
function mountField(props: Record<string, unknown> = {}, modelValue = '') {
  const wrapper = mount(BaseSearchField, {
    props: {
      label: 'Search the docs',
      modelValue,
      'onUpdate:modelValue': (value: string) => wrapper.setProps({ modelValue: value }),
      ...props,
    },
    attachTo: document.body,
  })
  return wrapper
}

describe('BaseSearchField', () => {
  it('renders a search input named by its label inside a search landmark', () => {
    const wrapper = mountField({ placeholder: 'SEARCH DOCS' })
    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('search')
    expect(input.attributes('aria-label')).toBe('Search the docs')
    expect(input.attributes('placeholder')).toBe('SEARCH DOCS')
    expect(wrapper.get('.ba-search-field').attributes('role')).toBe('search')
  })

  it('drops the search landmark when landmark is false', () => {
    const wrapper = mountField({ landmark: false })
    expect(wrapper.get('.ba-search-field').attributes('role')).toBeUndefined()
  })

  it('supports a text input type and custom ids', () => {
    const wrapper = mountField(
      { inputType: 'text', inputId: 'my-input', clearId: 'my-clear' },
      'abc',
    )
    expect(wrapper.get('input').attributes('type')).toBe('text')
    expect(wrapper.get('input').attributes('id')).toBe('my-input')
    expect(wrapper.find('#my-clear').exists()).toBe(true)
  })

  it('hides the clear button while empty and shows it once there is text', async () => {
    const wrapper = mountField()
    expect(wrapper.find('.ba-search-field__clear').exists()).toBe(false)
    await wrapper.get('input').setValue('sdr')
    expect(wrapper.find('.ba-search-field__clear').exists()).toBe(true)
  })

  it('updates the model as the reader types', async () => {
    const wrapper = mountField()
    await wrapper.get('input').setValue('radio')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['radio'])
  })

  it('names the clear button "Clear search" by default and accepts a custom name', () => {
    const wrapper = mountField({}, 'x')
    expect(wrapper.get('.ba-search-field__clear').attributes('aria-label')).toBe('Clear search')

    const custom = mountField({ clearLabel: 'Reset' }, 'x')
    expect(custom.get('.ba-search-field__clear').attributes('aria-label')).toBe('Reset')
  })

  it('clears the text, emits clear and keeps focus in the input when clear is pressed', async () => {
    const wrapper = mountField({}, 'sdr')
    await wrapper.get('.ba-search-field__clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.get('input').element)
    expect(wrapper.find('.ba-search-field__clear').exists()).toBe(false)
  })

  it('exposes focus(), select() and the input element', () => {
    const wrapper = mountField({}, 'hello')
    const exposed = wrapper.vm as unknown as {
      focus: () => void
      select: () => void
      input: HTMLInputElement | null
    }
    exposed.focus()
    expect(document.activeElement).toBe(wrapper.get('input').element)
    exposed.select()
    const element = wrapper.get('input').element as HTMLInputElement
    expect(element.selectionStart).toBe(0)
    expect(element.selectionEnd).toBe(5)
    expect(exposed.input).toBe(element)
  })

  it('lets native keydown fall through to the input', async () => {
    let seenKey = ''
    const wrapper = mountField({ onKeydown: (event: KeyboardEvent) => (seenKey = event.key) })
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    expect(seenKey).toBe('ArrowDown')
  })

  it('has no accessibility violations empty or filled', async () => {
    const wrapper = mountField({ placeholder: 'SEARCH DOCS' })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    await wrapper.get('input').setValue('sdr')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
