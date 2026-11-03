import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'

vi.mock('./settings/ExportAllControl.vue', () => ({ default: { name: 'ExportAllControl' } }))
const refreshSettings = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/shell/applySettings', () => ({ refreshSettingsFromBackend: refreshSettings }))

import SettingsPanel from './SettingsPanel.vue'
import SettingRow from './settings/SettingRow.vue'
import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import type { SettingItem } from '@sentinel/shell-api/types/settings'

// A section of its own, so every way cards can fall into groups is pinned
// without depending on how the real sections happen to be laid out today:
// cards before any heading, a card with no label joining the group above, and
// two groups with headings.
const StubControl = defineComponent({ name: 'StubControl', setup: () => () => h('div') })

function card(id: string, groupLabel?: string): SettingItem {
  return {
    section: 'grouping',
    sectionLabel: 'Grouping',
    id,
    label: id,
    desc: '',
    control: { component: StubControl, layout: 'half' },
    ...(groupLabel === undefined ? {} : { groupLabel }),
  }
}

registerSettingsSection({ key: 'grouping', label: 'GROUPING', order: 900, domain: false })
registerSettingItems([
  card('loose-first'),
  card('alpha-one', 'ALPHA'),
  card('alpha-unlabelled'),
  card('beta-one', 'BETA'),
  card('beta-two', 'BETA'),
])

/** The id of the setting a rendered SettingRow shows. */
function cardId(row: { props(): Record<string, unknown> }): string {
  return (row.props().item as SettingItem).id
}

function mountPanel() {
  return mount(SettingsPanel, {
    global: { stubs: { SettingRow: true, RouterLink: RouterLinkStub } },
  })
}

type PanelWrapper = ReturnType<typeof mountPanel>

async function openSection(wrapper: PanelWrapper, tooltip: string): Promise<void> {
  await wrapper
    .findAll('.settings-nav-item')
    .find((node) => node.attributes('data-tooltip') === tooltip)!
    .trigger('click')
}

async function mountOnGroupingSection(): Promise<PanelWrapper> {
  const wrapper = mountPanel()
  await openSection(wrapper, 'GROUPING')
  return wrapper
}

function headings(wrapper: PanelWrapper) {
  return wrapper.findAll('button.settings-group-label')
}

function heading(wrapper: PanelWrapper, label: string) {
  return headings(wrapper).find((node) => node.text() === label)!
}

/** The ids of the cards inside the element a heading controls. */
function cardIdsUnder(wrapper: PanelWrapper, label: string): string[] {
  const body = wrapper.find(`#${heading(wrapper, label).attributes('aria-controls')}`)
  return body.findAllComponents(SettingRow).map(cardId)
}

function groupBodies(wrapper: PanelWrapper) {
  return wrapper.findAll('.settings-group-body')
}

function isShown(node: { attributes: (name: string) => string | undefined }): boolean {
  return !(node.attributes('style') ?? '').includes('display: none')
}

enableAutoUnmount(afterEach)

describe('SettingsPanel groups', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('gives every labelled group a heading button, in order', async () => {
    const wrapper = await mountOnGroupingSection()

    expect(headings(wrapper).map((node) => node.text())).toEqual(['ALPHA', 'BETA'])
    for (const node of headings(wrapper)) {
      expect(node.attributes('type')).toBe('button')
      expect(node.attributes('aria-expanded')).toBe('true')
    }
  })

  it('lists cards before any heading in a group of their own, with no heading', async () => {
    const wrapper = await mountOnGroupingSection()

    const [firstBody] = groupBodies(wrapper)
    expect(firstBody!.findAllComponents(SettingRow).map(cardId)).toEqual(['loose-first'])
    expect(groupBodies(wrapper)).toHaveLength(3)
  })

  it('points each heading at the cards of its group, a card with no label joining the group above', async () => {
    const wrapper = await mountOnGroupingSection()

    expect(cardIdsUnder(wrapper, 'ALPHA')).toEqual(['alpha-one', 'alpha-unlabelled'])
    expect(cardIdsUnder(wrapper, 'BETA')).toEqual(['beta-one', 'beta-two'])
  })

  it('folds only its own group, and unfolds it again', async () => {
    const wrapper = await mountOnGroupingSection()
    const [looseBody, alphaBody, betaBody] = groupBodies(wrapper)

    await heading(wrapper, 'ALPHA').trigger('click')
    expect(heading(wrapper, 'ALPHA').attributes('aria-expanded')).toBe('false')
    expect([isShown(looseBody!), isShown(alphaBody!), isShown(betaBody!)]).toEqual([
      true,
      false,
      true,
    ])
    expect(heading(wrapper, 'BETA').attributes('aria-expanded')).toBe('true')

    await heading(wrapper, 'ALPHA').trigger('click')
    expect(heading(wrapper, 'ALPHA').attributes('aria-expanded')).toBe('true')
    expect(isShown(alphaBody!)).toBe(true)
  })

  it('keeps a fold when the operator visits another section and comes back', async () => {
    const wrapper = await mountOnGroupingSection()
    await heading(wrapper, 'BETA').trigger('click')

    await openSection(wrapper, 'App Settings')
    await openSection(wrapper, 'GROUPING')

    expect(heading(wrapper, 'BETA').attributes('aria-expanded')).toBe('false')
  })

  it('keeps a fold when the panel remounts, because the store holds it', async () => {
    const first = await mountOnGroupingSection()
    await heading(first, 'ALPHA').trigger('click')
    first.unmount()

    const second = await mountOnGroupingSection()

    expect(heading(second, 'ALPHA').attributes('aria-expanded')).toBe('false')
    expect(useSettingsStore().isGroupCollapsed('grouping:ALPHA')).toBe(true)
  })

  it('spaces a heading off the cards above it, but not off a folded group', async () => {
    const wrapper = await mountOnGroupingSection()
    const spaced = (label: string) =>
      heading(wrapper, label).element.parentElement!.classList.contains(
        'settings-group-heading--spaced',
      )

    // ALPHA follows the loose cards, BETA follows ALPHA's cards.
    expect([spaced('ALPHA'), spaced('BETA')]).toEqual([true, true])

    await heading(wrapper, 'ALPHA').trigger('click')
    expect([spaced('ALPHA'), spaced('BETA')]).toEqual([true, false])
  })

  it('shows search results whatever is folded', async () => {
    const wrapper = await mountOnGroupingSection()
    await heading(wrapper, 'BETA').trigger('click')

    await wrapper.find('#settings-search-input').setValue('beta-two')

    const shownIds = wrapper
      .findAllComponents(SettingRow)
      .filter((row) => isShown(row))
      .map((row) => (row.props('item') as SettingItem).id)
    expect(shownIds).toContain('beta-two')
    expect(headings(wrapper)).toHaveLength(0)
  })
})
