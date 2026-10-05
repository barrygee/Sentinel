import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { axe } from 'jest-axe'
import SettingRow from './SettingRow.vue'
import type { SettingControl, SettingItem } from '@sentinel/shell-api/types/settings'

// SettingRow renders whatever control the owning section registered (F3), so
// these specs use stand-in controls; which real control each setting gets is
// pinned by each section's settings-module spec.
const StandInControl = defineComponent({
  name: 'StandInControl',
  props: { ns: { type: String, default: '' }, filename: { type: String, default: '' } },
  emits: ['stage', 'commit'],
  setup: (props) => () => h('div', { class: 'stand-in' }, `${props.ns}|${props.filename}`),
})

function mountRow(item: Partial<SettingItem> = {}, control: Partial<SettingControl> = {}) {
  const fullItem: SettingItem = {
    section: 'test',
    sectionLabel: 'Test',
    id: 'test-id',
    label: 'Test',
    desc: '',
    ...item,
    control: { component: StandInControl, ...control },
  }
  return mount(SettingRow, { props: { item: fullItem, pending: new Map() } })
}

function cardClasses(wrapper: ReturnType<typeof mountRow>): string[] {
  return wrapper.find('.settings-item').classes()
}

describe('SettingRow', () => {
  it('renders the registered control with its props', () => {
    const wrapper = mountRow({}, { props: { ns: 'sea', filename: 'uk_repeaters.json' } })
    const control = wrapper.findComponent(StandInControl)
    expect(control.exists()).toBe(true)
    expect(control.props()).toEqual({ ns: 'sea', filename: 'uk_repeaters.json' })
  })

  it('renders the control without props when none are registered', () => {
    const wrapper = mountRow()
    expect(wrapper.find('.stand-in').text()).toBe('|')
  })

  it('renders the label and an optional description', () => {
    const withDesc = mountRow({ label: 'Alert Sound', desc: 'A blip' })
    expect(withDesc.find('.settings-item-label').text()).toBe('Alert Sound')
    expect(withDesc.find('.settings-item-desc').text()).toBe('A blip')

    const withoutDesc = mountRow({ label: 'Alert Sound' })
    expect(withoutDesc.find('.settings-item-desc').exists()).toBe(false)
  })

  it('keeps a hidden label in the accessibility tree only', () => {
    expect(mountRow({ hideLabel: true }).find('.settings-item-label').classes()).toContain(
      'sr-only',
    )
    expect(mountRow().find('.settings-item-label').classes()).not.toContain('sr-only')
  })

  describe('panel events', () => {
    it('forwards a declared stage event with the item id', () => {
      const wrapper = mountRow({ id: 'sea-ais-key' }, { emits: ['stage'] })
      const staged = async () => {}
      wrapper.findComponent(StandInControl).vm.$emit('stage', staged)
      expect(wrapper.emitted('stage')).toEqual([['sea-ais-key', staged]])
      expect(wrapper.emitted('commit')).toBeUndefined()
    })

    it('forwards a declared commit event', () => {
      const wrapper = mountRow({}, { emits: ['stage', 'commit'] })
      wrapper.findComponent(StandInControl).vm.$emit('commit')
      expect(wrapper.emitted('commit')).toHaveLength(1)
    })

    it('does not listen for events the control does not declare', () => {
      const wrapper = mountRow()
      const control = wrapper.findComponent(StandInControl)
      control.vm.$emit('stage', () => {})
      control.vm.$emit('commit')
      expect(wrapper.emitted('stage')).toBeUndefined()
      expect(wrapper.emitted('commit')).toBeUndefined()
    })

    it('a commit-less control never asks the panel to apply now', () => {
      const wrapper = mountRow({}, { emits: ['stage'] })
      wrapper.findComponent(StandInControl).vm.$emit('commit')
      expect(wrapper.emitted('commit')).toBeUndefined()
    })
  })

  describe('card layout', () => {
    it.each([
      ['half', 'settings-item--half'],
      ['half-stacked', 'settings-item--half-stacked'],
      ['full', 'settings-item--full'],
    ] as const)('a %s control gets the %s card', (layout, expectedClass) => {
      const classes = cardClasses(mountRow({}, { layout }))
      expect(classes).toContain(expectedClass)
      const otherLayouts = [
        'settings-item--half',
        'settings-item--half-stacked',
        'settings-item--full',
      ].filter((name) => name !== expectedClass)
      for (const other of otherLayouts) expect(classes).not.toContain(other)
    })

    it('a control without a layout gets the default one-column card', () => {
      const classes = cardClasses(mountRow())
      expect(classes).toEqual(['settings-item'])
    })

    it('a natural-height control grows to its content', () => {
      expect(cardClasses(mountRow({}, { naturalHeight: true }))).toContain(
        'settings-item--natural-height',
      )
      expect(cardClasses(mountRow())).not.toContain('settings-item--natural-height')
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountRow({ label: 'Alert Sound', desc: 'A blip' })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
