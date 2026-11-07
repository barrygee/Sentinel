import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MapRailRangeRingsButton from './MapRailRangeRingsButton.vue'

describe('MapRailRangeRingsButton', () => {
  it('uses one label in every section', () => {
    const button = mount(MapRailRangeRingsButton, { props: { active: false } }).get('button')

    expect(button.attributes('aria-label')).toBe('Range rings')
    expect(button.attributes('data-tooltip')).toBe('RANGE RINGS')
  })

  it('draws the rings around a centre point, hidden from assistive tech', () => {
    const icon = mount(MapRailRangeRingsButton, { props: { active: false } }).get('svg')

    expect(icon.findAll('circle')).toHaveLength(3)
    expect(icon.attributes('aria-hidden')).toBe('true')
  })

  it('shows whether the rings are on', () => {
    const isActive = (active: boolean) =>
      mount(MapRailRangeRingsButton, { props: { active } })
        .get('button')
        .classes()
        .includes('active')

    expect(isActive(true)).toBe(true)
    expect(isActive(false)).toBe(false)
  })

  it('passes the click through to the section', async () => {
    const onClick = vi.fn()
    const wrapper = mount(MapRailRangeRingsButton, { props: { active: false }, attrs: { onClick } })

    await wrapper.get('button').trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
