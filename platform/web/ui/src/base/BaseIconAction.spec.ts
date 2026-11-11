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

  it('adds no row, danger or active class by default', () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Edit' },
      slots: { default: '✎' },
    })
    const classes = wrapper.get('button').classes()
    expect(classes).not.toContain('ba-icon-action--row')
    expect(classes).not.toContain('ba-icon-action--danger')
    expect(classes).not.toContain('ba-icon-action--active')
  })

  it('adds the row class for variant="row" and drops it for variant="default"', async () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Edit device', variant: 'row' },
      slots: { default: '✎' },
    })
    expect(wrapper.get('button').classes()).toContain('ba-icon-action--row')
    await wrapper.setProps({ variant: 'default' })
    expect(wrapper.get('button').classes()).not.toContain('ba-icon-action--row')
  })

  it('adds the danger class only while danger is set', async () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Forget device', variant: 'row', danger: true },
      slots: { default: '✕' },
    })
    expect(wrapper.get('button').classes()).toContain('ba-icon-action--danger')
    await wrapper.setProps({ danger: false })
    expect(wrapper.get('button').classes()).not.toContain('ba-icon-action--danger')
  })

  it('tracks active with its own class even without an activeClass', async () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Edit device', variant: 'row', active: false },
      slots: { default: '✎' },
    })
    expect(wrapper.get('button').classes()).not.toContain('ba-icon-action--active')
    await wrapper.setProps({ active: true })
    expect(wrapper.get('button').classes()).toContain('ba-icon-action--active')
    await wrapper.setProps({ active: false })
    expect(wrapper.get('button').classes()).not.toContain('ba-icon-action--active')
  })

  it("adds its active class alongside the caller's activeClass", () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Play', active: true, activeClass: 'sdr-search-adhoc-play--active' },
      slots: { default: '▶' },
    })
    const classes = wrapper.get('button').classes()
    expect(classes).toContain('ba-icon-action--active')
    expect(classes).toContain('sdr-search-adhoc-play--active')
  })

  it('focus() moves document focus to the button', () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Delete offline area' },
      slots: { default: '✕' },
      attachTo: document.body,
    })
    const button = wrapper.get('button').element
    expect(document.activeElement).not.toBe(button)
    wrapper.vm.focus()
    expect(document.activeElement).toBe(button)
    wrapper.unmount()
  })

  it('focus() does nothing once the button is gone', () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Delete offline area' },
      slots: { default: '✕' },
      attachTo: document.body,
    })
    const focus = wrapper.vm.focus
    wrapper.unmount()
    expect(() => focus()).not.toThrow()
    expect(document.activeElement).toBe(document.body)
  })

  it('has no axe violations as an active danger row action', async () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Remove host', variant: 'row', danger: true, active: true },
      slots: { default: '<svg aria-hidden="true"></svg>' },
    })
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })

  it('has no axe violations', async () => {
    const wrapper = mount(BaseIconAction, {
      props: { accessibleName: 'Clear filter', tooltip: 'Clear filter' },
      slots: { default: '✕' },
    })
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
