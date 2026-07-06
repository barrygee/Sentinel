import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseListItem from './BaseListItem.vue'

describe('BaseListItem', () => {
  it('renders the default slot content', () => {
    const wrapper = mount(BaseListItem, { slots: { default: '<span class="probe">Row</span>' } })
    expect(wrapper.find('.probe').text()).toBe('Row')
  })

  it('does not add interactive/active classes by default', () => {
    const wrapper = mount(BaseListItem)
    const item = wrapper.find('.ba-list-item')
    expect(item.classes()).not.toContain('ba-list-item--interactive')
    expect(item.classes()).not.toContain('ba-list-item--active')
  })

  it('adds the interactive class when interactive=true', () => {
    const wrapper = mount(BaseListItem, { props: { interactive: true } })
    expect(wrapper.find('.ba-list-item').classes()).toContain('ba-list-item--interactive')
  })

  it('adds the active class when active=true', () => {
    const wrapper = mount(BaseListItem, { props: { active: true } })
    expect(wrapper.find('.ba-list-item').classes()).toContain('ba-list-item--active')
  })

  it('does not render an actions region when no #actions slot is given', () => {
    const wrapper = mount(BaseListItem, { slots: { default: 'Row' } })
    expect(wrapper.find('.ba-list-item-actions').exists()).toBe(false)
  })

  it('renders the #actions slot in a trailing actions region when given', () => {
    const wrapper = mount(BaseListItem, {
      slots: {
        default: 'Row',
        actions: '<button class="probe-action">Dismiss</button>',
      },
    })
    const actions = wrapper.find('.ba-list-item-actions')
    expect(actions.exists()).toBe(true)
    expect(actions.find('.probe-action').text()).toBe('Dismiss')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(BaseListItem, {
      props: { interactive: true },
      slots: { default: 'Row', actions: '<button aria-label="Dismiss">✕</button>' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
