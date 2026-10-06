import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type * as SectionEnginesModule from './sectionEngines'
import type * as SectionRegistryModule from '@sentinel/shell-api/shell/sectionRegistry'

/**
 * The registry and the loaded-pane ref are module-level, so each test
 * re-imports both from a fresh module graph — one test's engine must never
 * leak into the next.
 */
async function freshModules(): Promise<{
  engines: typeof SectionEnginesModule
  registry: typeof SectionRegistryModule
}> {
  vi.resetModules()
  const registry = await import('@sentinel/shell-api/shell/sectionRegistry')
  const engines = await import('./sectionEngines')
  return { engines, registry }
}

const SdrPane: Component = defineComponent({ name: 'SdrPane', setup: () => () => h('div') })

/** Registers an sdr section whose engine loads through `loadPane`. */
function registerSdr(
  registry: typeof SectionRegistryModule,
  loadPane?: () => Promise<{ default: Component }>,
): void {
  registry.registerSection({
    id: 'sdr',
    label: 'SDR',
    navOrder: 50,
    enabledByDefault: true,
    route: { path: '/sdr/', component: { name: 'SdrView' } },
    ...(loadPane ? { loadPersistentRadioPane: loadPane } : {}),
  })
}

/** A promise plus its resolver and rejecter, so a test decides when the engine lands. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('shell/sectionEngines', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits 3 s by default before mounting without the engine', async () => {
    const { engines } = await freshModules()

    expect(engines.ENGINE_BOOT_TIMEOUT_MS).toBe(3000)
  })

  it('reports "none" and leaves the pane empty when no section has an engine', async () => {
    const { engines, registry } = await freshModules()
    registerSdr(registry)

    expect(await engines.startSectionEngines()).toBe('none')
    expect(engines.usePersistentRadioPane().value).toBeUndefined()
  })

  it('reports "ready" and sets the pane when the engine loads inside the timeout', async () => {
    const { engines, registry } = await freshModules()
    registerSdr(registry, () => Promise.resolve({ default: SdrPane }))

    expect(await engines.startSectionEngines(1000)).toBe('ready')
    expect(engines.usePersistentRadioPane().value).toBe(SdrPane)
    expect(console.warn).not.toHaveBeenCalled()
    // The deadline was cleared: firing every timer now must not warn late.
    vi.runAllTimers()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('stops waiting at the timeout, then late-mounts the engine when it arrives', async () => {
    const { engines, registry } = await freshModules()
    const engineLoad = deferred<{ default: Component }>()
    registerSdr(registry, () => engineLoad.promise)

    const outcome = engines.startSectionEngines(1000)
    await vi.advanceTimersByTimeAsync(999)
    let settled = false
    void outcome.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toBe('late')
    expect(engines.usePersistentRadioPane().value).toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith(
      '[sentinel] the SDR engine is still loading after 1000 ms — mounting without it',
    )

    // Loading carried on past the deadline: the pane fills in on arrival.
    engineLoad.resolve({ default: SdrPane })
    await vi.waitFor(() => expect(engines.usePersistentRadioPane().value).toBe(SdrPane))
  })

  it('uses the default timeout when none is given', async () => {
    const { engines, registry } = await freshModules()
    registerSdr(registry, () => new Promise(() => {}))

    const outcome = engines.startSectionEngines()
    await vi.advanceTimersByTimeAsync(engines.ENGINE_BOOT_TIMEOUT_MS)

    expect(await outcome).toBe('late')
  })

  it('reports "failed", logs, and leaves the pane empty when the engine cannot load', async () => {
    const { engines, registry } = await freshModules()
    const loadError = new Error('remote down')
    registerSdr(registry, () => Promise.reject(loadError))

    expect(await engines.startSectionEngines(1000)).toBe('failed')
    expect(engines.usePersistentRadioPane().value).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      '[sentinel] the SDR engine could not be loaded:',
      loadError,
    )
  })

  it('logs a failure that comes after the timeout without ever setting the pane', async () => {
    const { engines, registry } = await freshModules()
    const engineLoad = deferred<{ default: Component }>()
    registerSdr(registry, () => engineLoad.promise)

    const outcome = engines.startSectionEngines(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await outcome).toBe('late')

    engineLoad.reject(new Error('gave up'))
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(engines.usePersistentRadioPane().value).toBeUndefined()
  })

  it('forgets the loaded pane on the test-seam reset', async () => {
    const { engines, registry } = await freshModules()
    registerSdr(registry, () => Promise.resolve({ default: SdrPane }))
    await engines.startSectionEngines(1000)

    engines.resetSectionEnginesForTests()

    expect(engines.usePersistentRadioPane().value).toBeUndefined()
  })
})
