import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
const registerSidebarSectionTab = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sidebarRegistry', () => ({
  registerSidebarFilterSubTabs,
  registerSidebarSectionTab,
}))
// SpaceView.vue's real module graph pulls in a full MapLibre globe — heavy,
// and irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which SpaceView.spec.ts already covers).
vi.mock('./SpaceView.vue', () => ({ default: { name: 'SpaceView' } }))

describe('components/space/section', () => {
  it('registers the SPACE section with its id, label, navOrder, and routed view', async () => {
    const { default: SpaceView } = await import('./SpaceView.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'space',
      label: 'SPACE',
      navOrder: 20,
      route: { path: '/space/', component: SpaceView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { spaceSidebarFilter } = await import('./spaceSidebarFilter')
    await import('./section')

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith(
      'space',
      spaceSidebarFilter,
    )
  })

  it('registers the PASSES rail tab, shown on Space only', async () => {
    const { default: SpacePassesTabIcon } = await import('./SpacePassesTabIcon.vue')
    await import('./section')

    expect(registerSidebarSectionTab).toHaveBeenCalledExactlyOnceWith({
      id: 'passes',
      label: 'PASSES',
      sectionId: 'space',
      icon: SpacePassesTabIcon,
    })
  })
})
