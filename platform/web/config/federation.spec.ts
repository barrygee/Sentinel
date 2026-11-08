import type { UserConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { assertSharedCoreHasNoMap, lazyMapSharesPlugin, type BuiltChunk } from './federation.ts'

const UI_MODULE = '/repo/platform/web/ui/src/components/BaseButton.vue'
const SHELL_API_MODULE = '/repo/platform/web/shell-api/src/services/settingsApi.ts'
const MAP_KIT_MODULE = '/repo/platform/web/map-kit/src/utils/mapStyle.ts'
const MAPLIBRE_MODULE = '/repo/node_modules/maplibre-gl/dist/maplibre-gl.js'
const VUE_MODULE = '/repo/node_modules/vue/dist/vue.runtime.esm-bundler.js'
const MAPLIBRE_WRAPPER =
  '\0virtual:mf___mfe_internal__sentinel_shell__mf_owner__1__loadShare__maplibre_mf_2_gl__loadShare__.js'
const MAP_KIT_WRAPPER =
  '\0virtual:mf___mfe_internal__sentinel_shell__mf_owner__1__loadShare___mf_0_sentinel_mf_1_map_mf_2_kit_mf_1_utils_mf_1_locationUtils__loadShare__.js'

/** A built JS chunk with the given name, modules and static imports. */
function chunk(
  fileName: string,
  details: { name?: string; moduleIds?: string[]; imports?: string[] } = {},
): BuiltChunk {
  return { type: 'chunk', fileName, ...details }
}

/** A bundle keyed by file name, as Rolldown hands it to `generateBundle`. */
function bundleOf(...outputs: BuiltChunk[]): Record<string, BuiltChunk> {
  return Object.fromEntries(outputs.map((output) => [output.fileName, output]))
}

describe('assertSharedCoreHasNoMap', () => {
  it('passes when shared-core and everything it imports are map-free', () => {
    const bundle = bundleOf(
      chunk('shared-core.js', {
        name: 'shared-core',
        moduleIds: [UI_MODULE, SHELL_API_MODULE],
        imports: ['vue.js'],
      }),
      chunk('vue.js', { name: 'vue', moduleIds: [VUE_MODULE] }),
      // Map code nothing imports statically, as a dynamic import would leave it.
      chunk('MapLibreMap.js', { moduleIds: [MAP_KIT_MODULE, MAPLIBRE_MODULE] }),
    )

    expect(() => assertSharedCoreHasNoMap(bundle)).not.toThrow()
  })

  it('fails when the build has no shared-core chunk', () => {
    const bundle = bundleOf(chunk('vue.js', { name: 'vue', moduleIds: [VUE_MODULE] }))

    expect(() => assertSharedCoreHasNoMap(bundle)).toThrow('the build has no shared-core chunk')
  })

  it('does not take an asset named shared-core for the chunk', () => {
    const bundle = bundleOf({ type: 'asset', name: 'shared-core', fileName: 'shared-core.css' })

    expect(() => assertSharedCoreHasNoMap(bundle)).toThrow('the build has no shared-core chunk')
  })

  it("fails when shared-core holds map-kit's code, naming the module and chunk", () => {
    const bundle = bundleOf(
      chunk('shared-core.js', { name: 'shared-core', moduleIds: [UI_MODULE, MAP_KIT_MODULE] }),
    )

    expect(() => assertSharedCoreHasNoMap(bundle)).toThrow(
      `shared-core reaches map code (${MAP_KIT_MODULE} in shared-core.js)`,
    )
  })

  it('fails when shared-core holds MapLibre', () => {
    const bundle = bundleOf(
      chunk('shared-core.js', { name: 'shared-core', moduleIds: [MAPLIBRE_MODULE] }),
    )

    expect(() => assertSharedCoreHasNoMap(bundle)).toThrow(MAPLIBRE_MODULE)
  })

  it.each([
    ['MapLibre', MAPLIBRE_WRAPPER],
    ['a map-kit module', MAP_KIT_WRAPPER],
  ])('fails when shared-core imports the share wrapper of %s', (_label, wrapperId) => {
    const bundle = bundleOf(
      chunk('shared-core.js', { name: 'shared-core', imports: ['wrapper.js'] }),
      chunk('wrapper.js', { moduleIds: [wrapperId] }),
    )

    expect(() => assertSharedCoreHasNoMap(bundle)).toThrow(`(${wrapperId} in wrapper.js)`)
  })

  it('fails when a chunk shared-core imports two levels down holds map code', () => {
    const bundle = bundleOf(
      chunk('shared-core.js', { name: 'shared-core', moduleIds: [UI_MODULE], imports: ['a.js'] }),
      chunk('a.js', { moduleIds: [VUE_MODULE], imports: ['b.js'] }),
      chunk('b.js', { moduleIds: [MAP_KIT_MODULE] }),
    )

    expect(() => assertSharedCoreHasNoMap(bundle)).toThrow(`(${MAP_KIT_MODULE} in b.js)`)
  })

  it('treats map-kit files outside src/ as not map code', () => {
    const bundle = bundleOf(
      chunk('shared-core.js', {
        name: 'shared-core',
        moduleIds: ['/repo/platform/web/map-kit/package.json'],
      }),
    )

    expect(() => assertSharedCoreHasNoMap(bundle)).not.toThrow()
  })

  it('ends on import cycles and skips imports outside the bundle', () => {
    const bundle = bundleOf(
      chunk('shared-core.js', {
        name: 'shared-core',
        imports: ['cycle.js', 'external-only.js'],
      }),
      chunk('cycle.js', { imports: ['shared-core.js'] }),
    )

    expect(() => assertSharedCoreHasNoMap(bundle)).not.toThrow()
  })
})

/** The chunk-group shape the plugin reads and edits. */
interface TestChunkGroup {
  name?: string | ((moduleId: string) => string | null | undefined)
  test?: (moduleId: string) => boolean
  priority?: number
}

/** A stand-in for the federation plugin's own group: named by a function, at its priority. */
function federationGroup(): TestChunkGroup {
  return { name: () => 'federation-chunk', priority: 1_000_000 }
}

/** Runs the plugin's `config` hook on these groups and returns them as it leaves them. */
function configureGroups(groups: TestChunkGroup[]): TestChunkGroup[] {
  const plugin = lazyMapSharesPlugin()
  const config = {
    build: { rolldownOptions: { output: { codeSplitting: { groups } } } },
  } as unknown as UserConfig
  ;(plugin.config as (config: UserConfig) => void)(config)
  return groups
}

/** The group the plugin added under this name. */
function groupNamed(groups: TestChunkGroup[], name: string): TestChunkGroup {
  const group = groups.find((candidate) => candidate.name === name)
  if (group === undefined) throw new Error(`no ${name} group`)
  return group
}

describe('lazyMapSharesPlugin chunk groups', () => {
  it('fails when the federation plugin has no chunk group to edit', () => {
    expect(() => configureGroups([{ name: 'other', priority: 5 }])).toThrow(
      "the federation plugin's chunk group is missing",
    )
  })

  it('puts ui and shell-api code in shared-core', () => {
    const sharedCore = groupNamed(configureGroups([federationGroup()]), 'shared-core')

    expect(sharedCore.test?.(UI_MODULE)).toBe(true)
    expect(sharedCore.test?.(SHELL_API_MODULE)).toBe(true)
  })

  it('leaves out map-kit, lazy modules, files outside src/ and other packages', () => {
    const groups = configureGroups([federationGroup()])
    const sharedCore = groupNamed(groups, 'shared-core')

    // Map-kit stays one file per module: SDR Manager-only mode loads some of them.
    expect(sharedCore.test?.(MAP_KIT_MODULE)).toBe(false)
    expect(groups.filter((group) => group.test?.(MAP_KIT_MODULE))).toEqual([])
    expect(sharedCore.test?.('/repo/platform/web/ui/src/lazy/CodeEditor.vue')).toBe(false)
    expect(sharedCore.test?.('/repo/platform/web/ui/package.json')).toBe(false)
    expect(sharedCore.test?.(VUE_MODULE)).toBe(false)
  })

  it('ranks shared-core below every existing group', () => {
    const groups = configureGroups([federationGroup(), { name: 'vendor', priority: -3 }, {}])

    expect(groupNamed(groups, 'shared-core').priority).toBe(-4)
  })

  it('runs the shared-core guard on the finished bundle', () => {
    const plugin = lazyMapSharesPlugin()
    const generateBundle = plugin.generateBundle as (
      options: unknown,
      bundle: Record<string, BuiltChunk>,
    ) => void

    expect(() => generateBundle({}, bundleOf())).toThrow('the build has no shared-core chunk')
    expect(() =>
      generateBundle({}, bundleOf(chunk('shared-core.js', { name: 'shared-core' }))),
    ).not.toThrow()
  })
})
