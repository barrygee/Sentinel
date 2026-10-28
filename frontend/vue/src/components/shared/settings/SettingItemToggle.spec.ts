import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { axe } from 'jest-axe'
import SettingItemToggle from './SettingItemToggle.vue'
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'

function mountToggle(expanded: boolean) {
  return mount(SettingItemToggle, {
    props: { label: 'Hotspot', expanded, controlsId: 'settings-item-body-hotspot' },
  })
}

describe('SettingItemToggle', () => {
  it('is a button named by the card title, in the title style', () => {
    const button = mountToggle(false).get('button')

    expect(button.attributes('type')).toBe('button')
    expect(button.get('.settings-item-label').text()).toBe('Hotspot')
    expect(button.text()).toBe('Hotspot')
  })

  it('points at the control it shows and hides', () => {
    expect(mountToggle(false).get('button').attributes('aria-controls')).toBe(
      'settings-item-body-hotspot',
    )
  })

  it.each([
    [false, 'false'],
    [true, 'true'],
  ])('says whether the card is open (expanded=%s)', (expanded, ariaExpanded) => {
    const wrapper = mountToggle(expanded)

    expect(wrapper.get('button').attributes('aria-expanded')).toBe(ariaExpanded)
    expect(wrapper.findComponent(ChevronIcon).props('open')).toBe(expanded)
  })

  it('asks the card to open or fold when clicked, leaving the state to the card', async () => {
    const wrapper = mountToggle(false)

    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([[], []])
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
  })

  it.each([false, true])('has no axe violations (expanded=%s)', async (expanded) => {
    // With the element it controls, so aria-controls points at something real.
    const CardTitle = defineComponent({
      setup: () => () =>
        h('div', [
          h(SettingItemToggle, { label: 'Hotspot', expanded, controlsId: 'body' }),
          h('div', { id: 'body' }, 'Control'),
        ]),
    })
    const wrapper = mount(CardTitle, { attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
