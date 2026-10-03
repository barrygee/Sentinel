import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
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

  it('registers its Settings section and items', async () => {
    await import('./section')
    const { getSettingItems, getSettingsSections } = await import('@/shell/settingsRegistry')

    expect(getSettingsSections().map((section) => section.key)).toContain('space')
    expect(getSettingItems().some((item) => item.section === 'space')).toBe(true)
  })
})
