import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RemoteHostAutoAddToggle from './RemoteHostAutoAddToggle.vue'

function mountToggle(modelValue = false) {
  return mount(RemoteHostAutoAddToggle, {
    props: { modelValue, labelledBy: 'auto-add-label' },
    attachTo: document.body,
  })
}

/** `RemoteHostAutoAddToggle` — ADD SDRS: MANUALLY / AUTOMATICALLY for one host. */
describe('RemoteHostAutoAddToggle', () => {
  it('is a radio group named by the label the caller points at, MANUALLY first', () => {
    const wrapper = mountToggle()
    expect(wrapper.get('[role="radiogroup"]').attributes('aria-labelledby')).toBe('auto-add-label')
    expect(wrapper.findAll('[role="radio"]').map((radio) => radio.text())).toEqual([
      'MANUALLY',
      'AUTOMATICALLY',
    ])
    wrapper.unmount()
  })

  it.each([
    [false, ['true', 'false'], ['0', '-1']],
    [true, ['false', 'true'], ['-1', '0']],
  ] as const)(
    'with %s, marks only its radio checked and makes it the only tab stop',
    (autoAdd, checked, tabindexes) => {
      const wrapper = mountToggle(autoAdd)
      const radios = wrapper.findAll('[role="radio"]')
      expect(radios.map((radio) => radio.attributes('aria-checked'))).toEqual([...checked])
      expect(radios.map((radio) => radio.attributes('tabindex'))).toEqual([...tabindexes])
      expect(radios[autoAdd ? 1 : 0]!.classes()).toContain('is-active')
      expect(radios[autoAdd ? 0 : 1]!.classes()).not.toContain('is-active')
      wrapper.unmount()
    },
  )

  it('emits the clicked option', async () => {
    const wrapper = mountToggle(false)
    await wrapper.findAll('[role="radio"]')[1]!.trigger('click')
    await wrapper.findAll('[role="radio"]')[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it.each([
    ['ArrowRight', false, true],
    ['ArrowDown', false, true],
    ['ArrowLeft', true, false],
    ['ArrowUp', true, false],
    ['ArrowRight', true, false],
  ] as const)('moves the selection with %s from %s to %s (wrapping)', async (key, from, to) => {
    const wrapper = mountToggle(from)
    await wrapper.findAll('[role="radio"]')[from ? 1 : 0]!.trigger('keydown', { key })
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
      components: { RemoteHostAutoAddToggle },
      template: `<div><span id="auto-add-label">ADD SDRS</span>
        <RemoteHostAutoAddToggle :model-value="false" labelled-by="auto-add-label" /></div>`,
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
