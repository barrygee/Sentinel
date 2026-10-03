import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
// LandView.vue's real module graph pulls in a full MapLibre map — heavy, and
// irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which LandView.spec.ts already covers).
vi.mock('./LandView.vue', () => ({ default: { name: 'LandView' } }))

describe('components/land/section', () => {
  it('registers the LAND section with its id, label, navOrder, and routed view', async () => {
    const { default: LandView } = await import('./LandView.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'land',
      label: 'LAND',
      navOrder: 40,
      route: { path: '/land/', component: LandView },
    })
  })

  it('registers its Settings section and items', async () => {
    await import('./section')
    const { getSettingItems, getSettingsSections } = await import('@/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('land')
    expect(getSettingItems().some((item) => item.section === 'land')).toBe(true)
  })
})
