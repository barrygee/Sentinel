import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import IconRail from './IconRail.vue'

describe('IconRail', () => {
  it('renders a nav landmark with the passed id and accessible name', () => {
    const wrapper = mount(IconRail, {
      props: { containerId: 'space-side-menu', accessibleName: 'Space map controls' },
    })
    const nav = wrapper.get('nav')
    expect(nav.attributes('id')).toBe('space-side-menu')
    expect(nav.attributes('aria-label')).toBe('Space map controls')
    expect(nav.classes()).toContain('icon-rail')
  })

  it('renders default slot content inside the rail', () => {
    const wrapper = mount(IconRail, {
      props: { containerId: 'side-menu', accessibleName: 'Air map controls' },
      slots: { default: '<button>Zoom in</button>' },
    })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.get('button').text()).toBe('Zoom in')
  })

  it('is not collapsed by default', () => {
    const wrapper = mount(IconRail, {
      props: { containerId: 'side-menu', accessibleName: 'Air map controls' },
    })
    expect(wrapper.get('nav').classes()).not.toContain('icon-rail--collapsed')
  })

  it('adds the collapsed modifier class when collapsed is true', () => {
    const wrapper = mount(IconRail, {
      props: { containerId: 'side-menu', accessibleName: 'Air map controls', collapsed: true },
    })
    expect(wrapper.get('nav').classes()).toContain('icon-rail--collapsed')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(IconRail, {
      props: { containerId: 'side-menu', accessibleName: 'Air map controls' },
      slots: {
        default: '<button aria-label="Zoom in">+</button>',
      },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
