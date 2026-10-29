import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
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

function mountRow(
  item: Partial<SettingItem> = {},
  control: Partial<SettingControl> = {},
  rowProps: { startOpen?: boolean } = {},
) {
  const fullItem: SettingItem = {
    section: 'test',
    sectionLabel: 'Test',
    id: 'test-id',
    label: 'Test',
    desc: '',
    ...item,
    control: { component: StandInControl, ...control },
  }
  // DocLink reads whether the docs service is deployed (offered by default).
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(SettingRow, {
    props: { item: fullItem, pending: new Map(), ...rowProps },
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } },
  })
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

  describe('docs link', () => {
    it('shows LEARN MORE, named after the setting, when the item has a docPath', () => {
      const wrapper = mountRow({ label: 'Recordings folder', docPath: 'operations#folder' })
      const link = wrapper.find('a.doc-link')
      expect(link.exists()).toBe(true)
      expect(link.attributes('aria-label')).toBe('Learn more about Recordings folder')
    })

    it('puts the link inside the info column, after the description', () => {
      const wrapper = mountRow({ desc: 'Where files go', docPath: 'operations' })
      const children = Array.from(wrapper.find('.settings-item-info').element.children)
      expect(children.map((child) => child.className.split(' ')[0])).toEqual([
        'settings-item-label',
        'settings-item-desc',
        'doc-link',
      ])
    })

    it('shows no link without a docPath', () => {
      expect(mountRow().find('a.doc-link').exists()).toBe(false)
    })
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

    it('a card with no visible title or description is headless', () => {
      expect(cardClasses(mountRow({ hideLabel: true }))).toContain('settings-item--headless')
    })

    it.each([
      ['a visible title', {}],
      ['a visible title and a description', { desc: 'About it.' }],
      ['a description under its hidden title', { hideLabel: true, desc: 'About it.' }],
    ])('a card with %s is not headless', (_case, item) => {
      expect(cardClasses(mountRow(item))).not.toContain('settings-item--headless')
    })
  })

  describe('collapsible card', () => {
    const toggleButton = (wrapper: ReturnType<typeof mountRow>) =>
      wrapper.get('button.settings-item-toggle')
    const body = (wrapper: ReturnType<typeof mountRow>) => wrapper.get('.settings-item-body')
    const isShowing = (wrapper: ReturnType<typeof mountRow>) =>
      (body(wrapper).element as HTMLElement).style.display !== 'none'

    it('starts folded: the title is a toggle and the control is hidden but mounted', () => {
      const wrapper = mountRow({ id: 'hotspot', label: 'Hotspot' }, { collapsible: {} })

      expect(toggleButton(wrapper).text()).toBe('Hotspot')
      expect(toggleButton(wrapper).attributes('aria-expanded')).toBe('false')
      expect(isShowing(wrapper)).toBe(false)
      // Hidden with v-show, so it keeps loading what it shows.
      expect(body(wrapper).findComponent(StandInControl).exists()).toBe(true)
    })

    it('ties the toggle to the control it shows by id', () => {
      const wrapper = mountRow({ id: 'hotspot' }, { collapsible: {} })

      expect(body(wrapper).attributes('id')).toBe('settings-item-body-hotspot')
      expect(toggleButton(wrapper).attributes('aria-controls')).toBe('settings-item-body-hotspot')
    })

    it('still shows the description and docs link while folded', () => {
      const wrapper = mountRow(
        { label: 'Hotspot', desc: 'A Wi-Fi network', docPath: 'use/sdr-manager' },
        { collapsible: {} },
      )

      expect(wrapper.get('.settings-item-desc').text()).toBe('A Wi-Fi network')
      expect(wrapper.find('a.doc-link').exists()).toBe(true)
    })

    it('opens and folds again from the toggle', async () => {
      const wrapper = mountRow({}, { collapsible: {} })

      await toggleButton(wrapper).trigger('click')
      expect(toggleButton(wrapper).attributes('aria-expanded')).toBe('true')
      expect(isShowing(wrapper)).toBe(true)

      await toggleButton(wrapper).trigger('click')
      expect(toggleButton(wrapper).attributes('aria-expanded')).toBe('false')
      expect(isShowing(wrapper)).toBe(false)
    })

    it('is open while openWhen says something in it needs doing, and follows it', async () => {
      const needed = ref(true)
      const wrapper = mountRow({}, { collapsible: { openWhen: () => needed.value } })
      expect(isShowing(wrapper)).toBe(true)

      needed.value = false
      await nextTick()
      expect(isShowing(wrapper)).toBe(false)
    })

    it("keeps the user's choice once they have used the toggle, whatever openWhen says", async () => {
      const needed = ref(true)
      const wrapper = mountRow({}, { collapsible: { openWhen: () => needed.value } })

      await toggleButton(wrapper).trigger('click')
      expect(isShowing(wrapper)).toBe(false)

      needed.value = false
      await nextTick()
      needed.value = true
      await nextTick()
      expect(isShowing(wrapper)).toBe(false)
    })

    it('starts open when the panel asks (a search result), and can still be folded', async () => {
      const wrapper = mountRow({}, { collapsible: {} }, { startOpen: true })
      expect(isShowing(wrapper)).toBe(true)

      await toggleButton(wrapper).trigger('click')
      expect(isShowing(wrapper)).toBe(false)
    })

    it('a card without collapsible has no toggle and no wrapper', () => {
      const wrapper = mountRow({}, {}, { startOpen: true })

      expect(wrapper.find('button.settings-item-toggle').exists()).toBe(false)
      expect(wrapper.find('.settings-item-body').exists()).toBe(false)
      expect(wrapper.find('.stand-in').exists()).toBe(true)
    })

    it('still forwards the control events while folded', () => {
      const wrapper = mountRow({ id: 'hotspot' }, { collapsible: {}, emits: ['stage', 'commit'] })
      const staged = async () => {}
      const control = wrapper.findComponent(StandInControl)

      control.vm.$emit('stage', staged)
      control.vm.$emit('commit')

      expect(wrapper.emitted('stage')).toEqual([['hotspot', staged]])
      expect(wrapper.emitted('commit')).toHaveLength(1)
    })

    it.each([false, true])('has no accessibility violations (open=%s)', async (startOpen) => {
      const wrapper = mountRow(
        { label: 'Hotspot', desc: 'A blip' },
        { collapsible: {} },
        { startOpen },
      )
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountRow({ label: 'Alert Sound', desc: 'A blip' })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
