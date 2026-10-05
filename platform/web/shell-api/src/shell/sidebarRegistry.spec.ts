import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import {
  getSidebarFilterSubTabs,
  getSidebarSectionTabs,
  registerSidebarFilterSubTabs,
  registerSidebarSectionTab,
  resetSidebarRegistryForTests,
  type SidebarFilterSubTabs,
} from './sidebarRegistry'

const Glyph = defineComponent({ template: '<svg />' })

function subTabs(): SidebarFilterSubTabs {
  return { tabs: () => [], isActive: () => false, select: () => undefined, icon: Glyph }
}

beforeEach(() => {
  resetSidebarRegistryForTests()
})

describe('sidebar filter sub-tabs', () => {
  it('has none for a section that registered nothing', () => {
    expect(getSidebarFilterSubTabs('sdr')).toBeUndefined()
  })

  it('returns what each section registered', () => {
    const air = subTabs()
    const sea = subTabs()
    registerSidebarFilterSubTabs('air', air)
    registerSidebarFilterSubTabs('sea', sea)

    expect(getSidebarFilterSubTabs('air')).toBe(air)
    expect(getSidebarFilterSubTabs('sea')).toBe(sea)
  })

  it('refuses a second registration for the same section', () => {
    registerSidebarFilterSubTabs('air', subTabs())
    expect(() => registerSidebarFilterSubTabs('air', subTabs())).toThrow(
      'Section "air" already registered sidebar filter sub-tabs',
    )
  })
})

describe('sidebar section-only tabs', () => {
  it('has none until a section registers one', () => {
    expect(getSidebarSectionTabs()).toEqual([])
  })

  it('lists registered tabs in registration order', () => {
    const passes = { id: 'passes' as const, label: 'PASSES', sectionId: 'space', icon: Glyph }
    const tracking = { id: 'tracking' as const, label: 'T', sectionId: 'air', icon: Glyph }
    registerSidebarSectionTab(passes)
    registerSidebarSectionTab(tracking)

    expect(getSidebarSectionTabs()).toEqual([passes, tracking])
  })

  it('refuses a second tab with the same id', () => {
    registerSidebarSectionTab({ id: 'passes', label: 'PASSES', sectionId: 'space', icon: Glyph })
    expect(() =>
      registerSidebarSectionTab({ id: 'passes', label: 'X', sectionId: 'air', icon: Glyph }),
    ).toThrow('Sidebar tab "passes" is already registered')
  })
})
