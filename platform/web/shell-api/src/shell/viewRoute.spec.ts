import { describe, it, expect, vi, afterEach } from 'vitest'
import { reactive } from 'vue'

// The current route, controllable: `useViewRoutePath` falls back to it.
const currentRoute = vi.hoisted(() => ({ value: null as null | { path: string } }))
vi.mock('vue-router', () => ({ useRoute: () => currentRoute.value }))

import { setViewRoutePath, useViewRoutePath } from './viewRoute'

afterEach(() => {
  setViewRoutePath(null)
})

describe('shell/viewRoute', () => {
  it('is the current route path while the shell has recorded none', () => {
    currentRoute.value = reactive({ path: '/sdr/' })
    const viewRoutePath = useViewRoutePath()

    expect(viewRoutePath.value).toBe('/sdr/')

    currentRoute.value.path = '/air/'
    expect(viewRoutePath.value).toBe('/air/')
  })

  it('is the page the shell records, whatever the URL says (the page under Settings)', () => {
    currentRoute.value = reactive({ path: '/settings/sdr' })
    const viewRoutePath = useViewRoutePath()

    setViewRoutePath('/sdr/')

    expect(viewRoutePath.value).toBe('/sdr/')
  })

  it('follows the recorded page as it changes, and falls back once it is cleared', () => {
    currentRoute.value = reactive({ path: '/air/' })
    const viewRoutePath = useViewRoutePath()

    setViewRoutePath('/space/')
    expect(viewRoutePath.value).toBe('/space/')
    setViewRoutePath('/sea/')
    expect(viewRoutePath.value).toBe('/sea/')

    setViewRoutePath(null)
    expect(viewRoutePath.value).toBe('/air/')
  })
})
