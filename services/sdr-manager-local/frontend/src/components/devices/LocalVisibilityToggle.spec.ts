import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import LocalVisibilityToggle from './LocalVisibilityToggle.vue'

function mountToggle(modelValue: 'public' | 'private' = 'public') {
  return mount(LocalVisibilityToggle, {
    props: { modelValue, labelledBy: 'visibility-label' },
    attachTo: document.body,
  })
}

describe('LocalVisibilityToggle', () => {
  it('is a radio group named by the label the caller points at', () => {
    const wrapper = mountToggle()
    const group = wrapper.get('[role="radiogroup"]')
    expect(group.attributes('aria-labelledby')).toBe('visibility-label')
    expect(wrapper.findAll('[role="radio"]').map((radio) => radio.text())).toEqual([
      'PUBLIC',
      'PRIVATE',
    ])
    wrapper.unmount()
  })

  it.each([
    ['public', ['true', 'false'], ['0', '-1']],
    ['private', ['false', 'true'], ['-1', '0']],
  ] as const)(
    'marks only the %s radio checked and makes it the only tab stop',
    (value, checked, tabindexes) => {
      const wrapper = mountToggle(value)
      const radios = wrapper.findAll('[role="radio"]')
      expect(radios.map((radio) => radio.attributes('aria-checked'))).toEqual([...checked])
      expect(radios.map((radio) => radio.attributes('tabindex'))).toEqual([...tabindexes])
      expect(radios[value === 'public' ? 0 : 1]!.classes()).toContain('is-active')
      wrapper.unmount()
    },
  )

  it('emits the clicked option', async () => {
    const wrapper = mountToggle('public')
    await wrapper.findAll('[role="radio"]')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['private']])
    await wrapper.findAll('[role="radio"]')[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['public'])
    wrapper.unmount()
  })

  it.each([
    ['ArrowRight', 'public', 'private'],
    ['ArrowDown', 'public', 'private'],
    ['ArrowLeft', 'private', 'public'],
    ['ArrowUp', 'private', 'public'],
    ['ArrowRight', 'private', 'public'],
    ['ArrowLeft', 'public', 'private'],
  ] as const)('moves the selection with %s from %s to %s (wrapping)', async (key, from, to) => {
    const wrapper = mountToggle(from)
    const radios = wrapper.findAll('[role="radio"]')
    await radios[from === 'public' ? 0 : 1]!.trigger('keydown', { key })
    expect(wrapper.emitted('update:modelValue')).toEqual([[to]])
    wrapper.unmount()
  })

  it('ignores keys that are not arrows', async () => {
    const wrapper = mountToggle()
    await wrapper.findAll('[role="radio"]')[0]!.trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('has no accessibility violations once its label exists', async () => {
    const wrapper = mount({
      components: { LocalVisibilityToggle },
      template: `<div><span id="visibility-label">VISIBILITY</span>
        <LocalVisibilityToggle model-value="public" labelled-by="visibility-label" /></div>`,
    })
    await expectNoAxeViolations(wrapper)
  })
})
