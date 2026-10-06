import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import type * as SectionLoaderModule from './sectionLoader'
import type * as SectionRegistryModule from '@sentinel/shell-api/shell/sectionRegistry'
import type { SectionRegisterModule, SectionSource } from './sectionLoader'

/**
 * The section registry keeps its sections in a module-level Map, so each test
 * re-imports the loader and the registry together from a fresh module graph —
 * one test's registrations must never leak into the next.
 */
async function freshModules(): Promise<{
  loader: typeof SectionLoaderModule
  registry: typeof SectionRegistryModule
}> {
  vi.resetModules()
  const registry = await import('@sentinel/shell-api/shell/sectionRegistry')
  const loader = await import('./sectionLoader')
  return { loader, registry }
}

/** A `./register` module whose register() records its call and registers the section. */
function registeringModule(
  registry: typeof SectionRegistryModule,
  sectionId: string,
  navOrder: number,
  calls: string[],
): SectionRegisterModule {
  return {
    default: () => {
      calls.push(sectionId)
      registry.registerSection({
        id: sectionId,
        label: sectionId.toUpperCase(),
        navOrder,
        enabledByDefault: true,
        route: { path: `/${sectionId}/`, component: { name: `${sectionId}View` } },
      })
    },
  }
}

/** What the shell hands every register(); the loader passes it through untouched. */
const shell = { pinia: createPinia() }

/** A promise plus its resolver, so a test controls the order loads settle in. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('shell/sectionLoader', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns no unavailable sections and registers nothing for an empty list', async () => {
    const { loader, registry } = await freshModules()

    expect(await loader.loadSections([], shell)).toEqual([])
    expect(registry.getRegisteredSections()).toEqual([])
  })

  it('calls register() in list order even when the modules arrive out of order', async () => {
    const { loader, registry } = await freshModules()
    const calls: string[] = []
    const airLoad = deferred<SectionRegisterModule>()
    const seaLoad = deferred<SectionRegisterModule>()
    const sources: SectionSource[] = [
      { id: 'air', load: () => airLoad.promise },
      { id: 'sea', load: () => seaLoad.promise },
    ]

    const loading = loader.loadSections(sources, shell)
    // Sea's module lands first; Air's register() must still run first.
    seaLoad.resolve(registeringModule(registry, 'sea', 30, calls))
    await Promise.resolve()
    expect(calls).toEqual([])
    airLoad.resolve(registeringModule(registry, 'air', 10, calls))

    expect(await loading).toEqual([])
    expect(calls).toEqual(['air', 'sea'])
    expect(registry.getRegisteredSections().map((section) => section.id)).toEqual(['air', 'sea'])
  })

  it('fetches every module before registering any of them', async () => {
    const { loader, registry } = await freshModules()
    const calls: string[] = []
    const started: string[] = []
    const sources: SectionSource[] = ['air', 'space'].map((sectionId, index) => ({
      id: sectionId,
      load: () => {
        started.push(sectionId)
        return Promise.resolve(registeringModule(registry, sectionId, (index + 1) * 10, calls))
      },
    }))

    const loading = loader.loadSections(sources, shell)
    expect(started).toEqual(['air', 'space'])
    await loading
    expect(calls).toEqual(['air', 'space'])
  })

  it('registers an unavailable stand-in for a section whose module fails to load', async () => {
    const { loader, registry } = await freshModules()
    const calls: string[] = []
    const loadError = new Error('remote entry 502')
    const sources: SectionSource[] = [
      { id: 'air', load: () => Promise.resolve(registeringModule(registry, 'air', 10, calls)) },
      { id: 'space', load: () => Promise.resolve(registeringModule(registry, 'space', 20, calls)) },
      { id: 'sea', load: () => Promise.reject(loadError) },
      { id: 'land', load: () => Promise.resolve(registeringModule(registry, 'land', 40, calls)) },
    ]

    const unavailable = await loader.loadSections(sources, shell)

    expect(unavailable).toEqual(['sea'])
    // The sections around the failed one still load.
    expect(calls).toEqual(['air', 'space', 'land'])
    const sea = registry.getRegisteredSections().find((section) => section.id === 'sea')
    expect(sea).toMatchObject({
      id: 'sea',
      label: 'SEA',
      // Its position in the list, in the 10, 20, … slots sections register at.
      navOrder: 30,
      enabledByDefault: false,
      unavailable: true,
      route: { path: '/sea/' },
    })
    expect(registry.isSectionUnavailable('sea')).toBe(true)
    expect(registry.isSectionUnavailable('air')).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      '[sentinel] section "sea" is unavailable:',
      loadError,
    )
  })

  it("keeps the stand-in's nav slot in list order", async () => {
    const { loader, registry } = await freshModules()
    const calls: string[] = []
    await loader.loadSections(
      [
        { id: 'air', load: () => Promise.reject(new Error('down')) },
        {
          id: 'space',
          load: () => Promise.resolve(registeringModule(registry, 'space', 20, calls)),
        },
      ],
      shell,
    )

    expect(registry.getNavEntries()).toEqual([
      ['air', 'AIR'],
      ['space', 'SPACE'],
    ])
  })

  it('registers a stand-in when register() throws before registering the section', async () => {
    const { loader, registry } = await freshModules()
    const registerError = new Error('register blew up')

    const unavailable = await loader.loadSections(
      [
        {
          id: 'land',
          load: () =>
            Promise.resolve({
              default: () => {
                throw registerError
              },
            }),
        },
      ],
      shell,
    )

    expect(unavailable).toEqual(['land'])
    expect(registry.isSectionUnavailable('land')).toBe(true)
    expect(console.error).toHaveBeenCalledWith(
      '[sentinel] section "land" is unavailable:',
      registerError,
    )
  })

  it('keeps what register() managed to register when it throws part-way', async () => {
    const { loader, registry } = await freshModules()
    const sdrView = { name: 'SdrView' }

    const unavailable = await loader.loadSections(
      [
        {
          id: 'sdr',
          load: () =>
            Promise.resolve({
              default: () => {
                registry.registerSection({
                  id: 'sdr',
                  label: 'SDR',
                  navOrder: 50,
                  enabledByDefault: true,
                  route: { path: '/sdr/', component: sdrView },
                })
                throw new Error('failed after registering')
              },
            }),
        },
      ],
      shell,
    )

    // Reported, but not replaced: a second registration would throw, and the
    // section's own route still works.
    expect(unavailable).toEqual(['sdr'])
    const sections = registry.getRegisteredSections()
    expect(sections).toHaveLength(1)
    expect(sections[0]?.route.component).toBe(sdrView)
    expect(registry.isSectionUnavailable('sdr')).toBe(false)
  })

  it('routes a stand-in to the unavailable page, named after the section', async () => {
    const { loader, registry } = await freshModules()
    await loader.loadSections([{ id: 'sea', load: () => Promise.reject(new Error('down')) }], shell)

    const [route] = registry.getSectionRoutes()
    expect(route).toMatchObject({ path: '/sea/', meta: { domain: 'sea' } })
    const wrapper = mount(route!.component)

    expect(wrapper.get('h1').text()).toBe('SEA is unavailable')
  })

  it('hands every register() the shell context it was given', async () => {
    const { loader } = await freshModules()
    const received: ShellContext[] = []

    await loader.loadSections(
      [
        {
          id: 'air',
          load: () => Promise.resolve({ default: (context) => received.push(context) }),
        },
        {
          id: 'sea',
          load: () => Promise.resolve({ default: (context) => received.push(context) }),
        },
      ],
      shell,
    )

    expect(received).toEqual([shell, shell])
    expect(received[0]).toBe(shell)
  })

  it('shows a remote that is not on the host Pinia as unavailable instead of registering it', async () => {
    const { loader, registry } = await freshModules()
    // What a remote that bundled its own pinia sees: some other Pinia.
    const remotesOwnPinia = createPinia()
    const register = vi.fn((context: ShellContext) => {
      assertHostPinia(context, remotesOwnPinia, 'land')
      registry.registerSection({
        id: 'land',
        label: 'LAND',
        navOrder: 40,
        enabledByDefault: true,
        route: { path: '/land/', component: { name: 'LandView' } },
      })
    })

    const unavailable = await loader.loadSections(
      [{ id: 'land', load: () => Promise.resolve({ default: register }) }],
      shell,
    )

    expect(register).toHaveBeenCalledOnce()
    expect(unavailable).toEqual(['land'])
    expect(registry.isSectionUnavailable('land')).toBe(true)
    expect(console.error).toHaveBeenCalledWith(
      '[sentinel] section "land" is unavailable:',
      expect.objectContaining({ message: expect.stringContaining("not using the shell's Pinia") }),
    )
  })
})
