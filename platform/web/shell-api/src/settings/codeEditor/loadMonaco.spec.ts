import { describe, expect, it, vi } from 'vitest'

const fakeMonacoApi = { editor: {} }
const lazyModuleLoaded = vi.fn()

vi.mock('./lazy/monacoEditor', () => {
  lazyModuleLoaded()
  return { monaco: fakeMonacoApi }
})

describe('loadMonaco', () => {
  it('loads Monaco on the first call only, and hands every caller the same API', async () => {
    const { loadMonaco } = await import('./loadMonaco')
    expect(lazyModuleLoaded).not.toHaveBeenCalled()
    const first = loadMonaco()
    const second = loadMonaco()
    expect(second).toBe(first)
    await expect(first).resolves.toBe(fakeMonacoApi)
    expect(lazyModuleLoaded).toHaveBeenCalledTimes(1)
  })
})
