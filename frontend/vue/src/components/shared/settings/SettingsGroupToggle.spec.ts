import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SettingsGroupToggle from './SettingsGroupToggle.vue'

function mountToggle(props: Partial<InstanceType<typeof SettingsGroupToggle>['$props']> = {}) {
  return mount(SettingsGroupToggle, {
    props: {
      label: 'DATA SOURCES',
      expanded: true,
      controlsId: 'group-body',
      spaced: false,
      ...props,
    },
    attachTo: document.body,
  })
}

describe('SettingsGroupToggle', () => {
  it('is a heading holding a button named by the group label', () => {
    const wrapper = mountToggle()

    expect(wrapper.element.tagName).toBe('H3')
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.text()).toBe('DATA SOURCES')
    expect(button.attributes('aria-controls')).toBe('group-body')
    wrapper.unmount()
  })

  it('says whether the group is open, and marks the chevron turned down only while it is', async () => {
    const wrapper = mountToggle({ expanded: true })
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.settings-group-chevron').classes()).toContain(
      'settings-group-chevron--expanded',
    )

    await wrapper.setProps({ expanded: false })
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.settings-group-chevron').classes()).not.toContain(
      'settings-group-chevron--expanded',
    )
    wrapper.unmount()
  })

  it('never flips the icon itself, which would point it up when open', async () => {
    // The wrapper's -90deg → 0deg turn is the whole motion; ChevronIcon's own
    // `open` flip (180deg) on top would send it right → up instead of down.
    const wrapper = mountToggle({ expanded: true })
    expect(wrapper.get('.chevron-icon').classes()).not.toContain('chevron-icon--open')

    await wrapper.setProps({ expanded: false })
    expect(wrapper.get('.chevron-icon').classes()).not.toContain('chevron-icon--open')
    wrapper.unmount()
  })

  it('puts the chevron after the label, so it sits at the right edge', () => {
    const wrapper = mountToggle()

    const children = [...wrapper.get('button').element.children]
    expect(children.map((child) => child.classList[0])).toEqual([
      'settings-group-label-text',
      'settings-group-chevron',
    ])
    expect(wrapper.get('.settings-group-chevron').find('.chevron-icon').exists()).toBe(true)
    wrapper.unmount()
  })

  it('asks to be toggled when clicked, and leaves the state to its owner', async () => {
    const wrapper = mountToggle()

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('is spaced off the group above only when asked', async () => {
    const wrapper = mountToggle({ spaced: false })
    expect(wrapper.classes()).not.toContain('settings-group-heading--spaced')

    await wrapper.setProps({ spaced: true })
    expect(wrapper.classes()).toContain('settings-group-heading--spaced')
    wrapper.unmount()
  })

  it('has no accessibility violations, open or folded', async () => {
    // aria-controls must name an element that exists, as the panel's group body does.
    const groupBody = document.createElement('div')
    groupBody.id = 'group-body'
    document.body.appendChild(groupBody)

    const open = mountToggle({ expanded: true })
    expect(await axe(open.element)).toHaveNoViolations()
    open.unmount()

    const folded = mountToggle({ expanded: false })
    expect(await axe(folded.element)).toHaveNoViolations()
    folded.unmount()
    groupBody.remove()
  })
})
