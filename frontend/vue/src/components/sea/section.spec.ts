import { describe, it, expect, vi } from 'vitest'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@/shell/sectionRegistry', () => ({ registerSection }))
// SeaView.vue's real module graph pulls in a full MapLibre map — heavy, and
// irrelevant to what this test asserts (the registration wiring, not the
// view's own behaviour, which SeaView.spec.ts already covers).
vi.mock('./SeaView.vue', () => ({ default: { name: 'SeaView' } }))

describe('components/sea/section', () => {
  it('registers the SEA section with its id, label, navOrder, and routed view', async () => {
    const { default: SeaView } = await import('./SeaView.vue')
    await import('./section')

    expect(registerSection).toHaveBeenCalledExactlyOnceWith({
      id: 'sea',
      label: 'SEA',
      navOrder: 30,
      route: { path: '/sea/', component: SeaView },
    })
  })
})
