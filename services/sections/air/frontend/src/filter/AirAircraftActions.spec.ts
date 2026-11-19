import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AirAircraftActions from './AirAircraftActions.vue'

function mountActions(tracking = false, alertsOn = false) {
  return mount(AirAircraftActions, { props: { tracking, alertsOn } })
}

const buttons = (wrapper: ReturnType<typeof mountActions>) => wrapper.findAll('button')

describe('AirAircraftActions', () => {
  it('renders track, alerts and centre as accessory buttons in one row', () => {
    const wrapper = mountActions()
    expect(wrapper.find('.ba-icon-action-row').exists()).toBe(true)
    expect(buttons(wrapper).map((button) => button.attributes('aria-label'))).toEqual([
      'Track aircraft',
      'Enable alerts',
      'Centre on map',
    ])
    for (const button of buttons(wrapper)) {
      expect(button.classes()).toContain('ba-icon-action--accessory')
      expect(button.attributes('data-tooltip')).toBe(button.attributes('aria-label'))
    }
  })

  it('names and marks the active states', () => {
    const wrapper = mountActions(true, true)
    const [track, alerts, centre] = buttons(wrapper)
    expect(track!.attributes('aria-label')).toBe('Untrack aircraft')
    expect(alerts!.attributes('aria-label')).toBe('Disable alerts')
    expect(track!.classes()).toContain('ba-icon-action--active')
    expect(alerts!.classes()).toContain('ba-icon-action--active')
    expect(centre!.classes()).not.toContain('ba-icon-action--active')
  })

  it('leaves track and alerts unmarked while off', () => {
    const [track, alerts] = buttons(mountActions())
    expect(track!.classes()).not.toContain('ba-icon-action--active')
    expect(alerts!.classes()).not.toContain('ba-icon-action--active')
  })

  it('strikes the bell through only while alerts are off', async () => {
    const wrapper = mountActions(false, false)
    const strikeCount = () => buttons(wrapper)[1]!.findAll('line').length
    const struck = strikeCount()
    await wrapper.setProps({ alertsOn: true })
    expect(strikeCount()).toBeLessThan(struck)
  })

  it('emits one event per button, without letting the click reach the row', async () => {
    const wrapper = mount({
      components: { AirAircraftActions },
      data: () => ({ rowClicks: 0 }),
      template: `<div @click="rowClicks++"><AirAircraftActions :tracking="false" :alerts-on="false" /></div>`,
    })
    const actions = wrapper.findComponent(AirAircraftActions)
    const [track, alerts, centre] = actions.findAll('button')
    await track!.trigger('click')
    await alerts!.trigger('click')
    await centre!.trigger('click')
    expect(actions.emitted('track')).toHaveLength(1)
    expect(actions.emitted('toggleAlerts')).toHaveLength(1)
    expect(actions.emitted('centre')).toHaveLength(1)
    expect((wrapper.vm as unknown as { rowClicks: number }).rowClicks).toBe(0)
  })

  it('has no axe violations', async () => {
    const wrapper = mountActions(true, false)
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
