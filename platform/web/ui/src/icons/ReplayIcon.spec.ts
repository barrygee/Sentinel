import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ReplayIcon from './ReplayIcon.vue'

describe('ReplayIcon', () => {
  it('is decorative and 18px by default', () => {
    const svg = mount(ReplayIcon).get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('18')
    expect(svg.findAll('path')).toHaveLength(3)
  })

  it('takes a size', () => {
    expect(
      mount(ReplayIcon, { props: { size: 24 } })
        .get('svg')
        .attributes('height'),
    ).toBe('24')
  })

  it('has no axe violations inside a named button', async () => {
    const wrapper = mount(
      {
        components: { ReplayIcon },
        template: '<button type="button" aria-label="Replay"><ReplayIcon /></button>',
      },
      { attachTo: document.body },
    )
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    wrapper.unmount()
  })
})
