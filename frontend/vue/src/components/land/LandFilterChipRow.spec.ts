import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import LandFilterChipRow, { type FilterChipOption } from './LandFilterChipRow.vue'

/**
 * `LandFilterChipRow` is one labelled row of toggle chips in the Land FILTER
 * pane (LAYERS, and the repeater BAND / MODE rows). What matters is that each
 * chip is an independently-pressable native button inside a *named* group, so
 * a screen reader says which set a chip belongs to — and that a disabled chip
 * explains itself rather than silently swallowing clicks.
 */

function option(overrides: Partial<FilterChipOption> = {}): FilterChipOption {
  return { key: '2M', label: '2M', active: false, ...overrides }
}

function mountRow(options: FilterChipOption[], label = 'Band') {
  return mount(LandFilterChipRow, { props: { label, options } })
}

describe('LandFilterChipRow', () => {
  it('names the row as a group so the chips are heard in context', () => {
    const wrapper = mountRow([option()], 'Mode')
    const group = wrapper.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Mode')
    // The visible caption repeats the group name for sighted users.
    expect(wrapper.get('.lfc-label').text()).toBe('Mode')
  })

  it('renders one native button per option, labelled by its text', () => {
    const wrapper = mountRow([
      option({ key: '2M', label: '2M' }),
      option({ key: '70CM', label: '70CM' }),
    ])
    const chips = wrapper.findAll('button')
    expect(chips).toHaveLength(2)
    expect(chips.map((chip) => chip.text())).toEqual(['2M', '70CM'])
    // A native <button> is what gives Enter/Space and focus for free.
    expect(chips[0]!.element.tagName).toBe('BUTTON')
    expect(chips[0]!.attributes('type')).toBe('button')
  })

  it('exposes each chip as an unpressed toggle until it is active', () => {
    const wrapper = mountRow([
      option({ key: 'all', label: 'All', active: true }),
      option({ key: '2M', label: '2M', active: false }),
    ])
    const chips = wrapper.findAll('button')
    expect(chips[0]!.attributes('aria-pressed')).toBe('true')
    expect(chips[0]!.classes()).toContain('lfc-chip-active')
    expect(chips[1]!.attributes('aria-pressed')).toBe('false')
    expect(chips[1]!.classes()).not.toContain('lfc-chip-active')
  })

  it('emits toggle with the option key, not its label or index', async () => {
    const wrapper = mountRow([
      option({ key: 'all', label: 'All' }),
      option({ key: '70CM', label: '70CM' }),
    ])
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([['70CM']])
  })

  it('renders nothing but the caption for an empty option list', () => {
    const wrapper = mountRow([])
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.get('.lfc-label').text()).toBe('Band')
  })

  it('leaves a chip enabled and untitled unless the row says otherwise', () => {
    const wrapper = mountRow([option()])
    const chip = wrapper.get('button')
    expect((chip.element as HTMLButtonElement).disabled).toBe(false)
    expect(chip.attributes('title')).toBeUndefined()
  })

  it('disables a chip with the reason on it, and it emits nothing when clicked', async () => {
    const wrapper = mountRow([
      option({ key: 'aprs', label: 'APRS', disabled: true, title: 'Choose an SDR first' }),
    ])
    const chip = wrapper.get('button')
    expect((chip.element as HTMLButtonElement).disabled).toBe(true)
    expect(chip.attributes('title')).toBe('Choose an SDR first')
    // jsdom does not suppress a synthetic click on a disabled button, so drive
    // it the way a user does — through the element's own activation behaviour.
    ;(chip.element as HTMLButtonElement).click()
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('keeps each chip keyboard-focusable', () => {
    const wrapper = mountRow(
      [option({ key: '2M' }), option({ key: '70CM', label: '70CM' })],
      'Band',
    )
    document.body.appendChild(wrapper.element)
    const chips = wrapper.findAll('button')
    for (const chip of chips) {
      const element = chip.element as HTMLButtonElement
      expect(element.tabIndex).toBe(0)
      element.focus()
      expect(document.activeElement).toBe(element)
    }
    wrapper.unmount()
  })

  it('has no accessibility violations, active or disabled', async () => {
    // `region` is off: the row always renders inside the FILTER pane's
    // landmark, never as a bare page fragment as it does here.
    const axeOptions = { rules: { region: { enabled: false } } }
    const wrapper = mountRow([
      option({ key: 'all', label: 'All', active: true }),
      option({ key: '2M', label: '2M' }),
      option({ key: 'aprs', label: 'APRS', disabled: true, title: 'Choose an SDR first' }),
    ])
    expect(await axe(wrapper.element, axeOptions)).toHaveNoViolations()
  })
})
