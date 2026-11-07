import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import MapRailLayerButton from './MapRailLayerButton.vue'

function mountButton(active = false, attrs: Record<string, unknown> = {}) {
  return mount(MapRailLayerButton, {
    props: { tooltip: 'AWACS', accessibleName: 'AWACS overlay', active },
    attrs,
    slots: { default: '<svg class="the-icon" aria-hidden="true"></svg>' },
  })
}

describe('MapRailLayerButton', () => {
  it('shows its icon under its name and tooltip', () => {
    const button = mountButton().get('button')

    expect(button.attributes('aria-label')).toBe('AWACS overlay')
    expect(button.attributes('data-tooltip')).toBe('AWACS')
    expect(button.find('.the-icon').exists()).toBe(true)
  })

  it('opens its tooltip to the left, as it sits on the right edge', () => {
    expect(mountButton().get('button').classes()).toContain('ba-icon-btn--tooltip-left')
  })

  it('is marked active only while the overlay is on', () => {
    expect(mountButton(false).get('button').classes()).not.toContain('active')
    expect(mountButton(true).get('button').classes()).toContain('active')
  })

  it('takes the stronger hover fill the grey panel needs', () => {
    expect(mountButton().get('button').attributes('style')).toContain(
      '--ba-rail-hover-bg: rgba(var(--rail-ink-rgb), 0.2)',
    )
  })

  it('passes the id, disabled state and click through to the button', async () => {
    const onClick = vi.fn()
    const button = mountButton(false, { id: 'an-id', disabled: true, onClick }).get('button')

    expect(button.attributes('id')).toBe('an-id')
    expect(button.attributes('disabled')).toBeDefined()

    const enabled = mountButton(false, { onClick }).get('button')
    await enabled.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations', async () => {
    expect(
      await axe(mountButton().html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
