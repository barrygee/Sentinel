import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseIconAction from './BaseIconAction.vue'

describe('BaseIconAction', () => {
  it('renders an icon-only type="button" with the required accessible name and slot glyph', () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Delete recording' },
      slots: { default: '✕' },
    })
    const action = wrapper.get('button')
    expect(action.attributes('type')).toBe('button')
    expect(action.attributes('aria-label')).toBe('Delete recording')
    expect(action.text()).toBe('✕')
    expect(action.classes()).toContain('ba-icon-action')
  })

  it('renders no tooltip attribute or side class without a tooltip', () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Dismiss' },
      slots: { default: '✕' },
    })
    const action = wrapper.get('button')
    expect(action.attributes('data-tooltip')).toBeUndefined()
    expect(action.classes().join(' ')).not.toContain('ba-icon-action--tip')
  })

  it('renders the tooltip attribute with the top side class by default', () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Track aircraft', tooltip: 'Track aircraft' },
      slots: { default: '<svg aria-hidden="true"></svg>' },
    })
    const action = wrapper.get('button')
    expect(action.attributes('data-tooltip')).toBe('Track aircraft')
    expect(action.classes()).toContain('ba-icon-action--tip-top')
  })

  it.each(['bottom', 'left'] as const)('renders the %s tooltip side class', (side) => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Clear', tooltip: 'Clear', tooltipSide: side },
      slots: { default: '✕' },
    })
    expect(wrapper.get('button').classes()).toContain(`ba-icon-action--tip-${side}`)
  })

  it('forwards active/activeClass to the underlying pill contract', async () => {
    const wrapper = mount(BaseIconAction, {
      props: {
        accessibleName: 'Edit',
        active: false,
        activeClass: 'sdr-recording-edit--active',
      },
      attrs: { class: 'sdr-recording-edit' },
      slots: { default: '✎' },
    })
    expect(wrapper.get('button').classes()).not.toContain('sdr-recording-edit--active')
    await wrapper.setProps({ active: true })
    expect(wrapper.get('button').classes()).toContain('sdr-recording-edit--active')
    expect(wrapper.get('button').classes()).toContain('sdr-recording-edit')
  })

  it('passes disabled and clicks through to the button element', async () => {
    let clickCount = 0
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Record pass' },
      attrs: {
        disabled: true,
        onClick: () => {
          clickCount += 1
        },
      },
      slots: { default: '●' },
    })
    const action = wrapper.get('button')
    expect(action.attributes('disabled')).toBeDefined()
    await action.trigger('click')
    expect(clickCount).toBe(0)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Clear filter', tooltip: 'Clear filter' },
      slots: { default: '✕' },
    })
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
