import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
const registerSidebarFilterSubTabs = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sidebarRegistry', () => ({ registerSidebarFilterSubTabs }))
// AirView.vue's real module graph pulls in a full MapLibre map — heavy, and
// irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which AirView.spec.ts already covers).
vi.mock('./AirView.vue', () => ({ default: { name: 'AirView' } }))

describe('components/air/section', () => {
  it('registers the AIR section with its id, label, navOrder, and routed view', async () => {
    const { default: AirView } = await import('./AirView.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'air',
      label: 'AIR',
      navOrder: 10,
      route: { path: '/air/', component: AirView },
    })
  })

  it('registers its FILTER rail sub-tabs', async () => {
    const { airSidebarFilter } = await import('./airSidebarFilter')
    await import('./section')

    expect(registerSidebarFilterSubTabs).toHaveBeenCalledExactlyOnceWith('air', airSidebarFilter)
  })
})
