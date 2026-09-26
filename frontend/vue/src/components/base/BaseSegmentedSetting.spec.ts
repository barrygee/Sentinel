import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseSegmentedSetting from './BaseSegmentedSetting.vue'

const OPTIONS = [
  { value: 'dark', label: 'DARK' },
  { value: 'light', label: 'LIGHT' },
  { value: 'colour', label: 'COLOUR' },
] as const

function mountGroup(modelValue: 'dark' | 'light' | 'colour' = 'dark') {
  return mount(BaseSegmentedSetting, {
    props: { modelValue, options: OPTIONS, accessibleName: 'Basemap palette' },
  })
}

/** The rendered radios, in order. */
function radios(wrapper: ReturnType<typeof mountGroup>) {
  return wrapper.findAll('[role="radio"]')
}

describe('BaseSegmentedSetting', () => {
  it('renders one radio per option, in order, inside a named radiogroup', () => {
    const wrapper = mountGroup()
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Basemap palette')
    expect(radios(wrapper).map((radio) => radio.text().trim())).toEqual(['DARK', 'LIGHT', 'COLOUR'])
    expect(radios(wrapper).map((radio) => radio.attributes('data-value'))).toEqual([
      'dark',
      'light',
      'colour',
    ])
  })

  it('checks the selected option and only that one', () => {
    const wrapper = mountGroup('light')
    expect(radios(wrapper).map((radio) => radio.attributes('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ])
  })

  it('emits the picked value on click', async () => {
    const wrapper = mountGroup('dark')
    await radios(wrapper)[2]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['colour']])
  })

  it('stays silent when the selected option is clicked again', async () => {
    const wrapper = mountGroup('dark')
    await radios(wrapper)[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('gives the group a single tab stop, on the selected option', () => {
    // Roving tabindex: Tab reaches the group once, then Arrow keys move within
    // it. Every option being tabbable would make the group a keyboard trap of
    // sorts — three stops for one setting.
    const wrapper = mountGroup('light')
    expect(radios(wrapper).map((radio) => radio.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('moves the selection with the arrow keys, wrapping at the ends', async () => {
    const wrapper = mountGroup('dark')
    await radios(wrapper)[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['light']])

    // Wrapping backwards off the first option lands on the last.
    await radios(wrapper)[0]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['light'], ['colour']])
  })

  it('ignores keys that are not arrows', async () => {
    const wrapper = mountGroup('dark')
    await radios(wrapper)[0]!.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountGroup('colour')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
