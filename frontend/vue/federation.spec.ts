import { describe, it, expect } from 'vitest'
import type { Plugin, PluginOption, UserConfig } from 'vite'
import {
  SHARED_MAP_KIT_MODULES_ID,
  SHARED_PACKAGE_MODULES_ID,
  lazyMapSharesPlugin,
  sectionFederationPlugin,
  sharedPackageModulesPlugin,
} from '@sentinel/web-config/federation'

/**
 * The shell's federation plugins that keep MapLibre and map-kit out of SDR
 * Manager-only mode (ADR 0007) while the full app still loads them. The real
 * build is the end-to-end proof (gateway-smoke's sdr-manager-deployment spec
 * watches its requests); these pin each piece to the plugin output it edits.
 */

type HookFunction = (...args: never[]) => unknown

/** A Vite hook's handler, whether the plugin wrote it as a function or `{ handler }`. */
function hook(plugin: Plugin, name: 'config' | 'transform' | 'buildEnd' | 'resolveId' | 'load') {
  const value = plugin[name] as HookFunction | { handler: HookFunction } | undefined
  const handler = typeof value === 'function' ? value : value?.handler
  if (handler === undefined) throw new Error(`plugin ${plugin.name} has no ${name} hook`)
  return handler as (...args: unknown[]) => unknown
}

function flatten(option: PluginOption): Plugin[] {
  if (Array.isArray(option)) return option.flatMap((entry) => flatten(entry as PluginOption))
  return option && typeof option === 'object' && 'name' in option ? [option as Plugin] : []
}

/** What the federation plugin names a chunk: its own wrappers merged into one startup chunk. */
const federationChunkName = (moduleId: string): string | null =>
  moduleId.includes('__loadShare__') ? 'loadShare__shared' : null

interface TestChunkGroup {
  name?: string | ((moduleId: string, ...rest: unknown[]) => string | null | undefined)
  test?: (moduleId: string) => boolean
  priority?: number
}

/** A build config holding the federation plugin's chunk group, as it leaves it. */
function federatedBuildConfig(extraGroups: TestChunkGroup[] = []) {
  const groups: TestChunkGroup[] = [
    { name: 'vendor', priority: 10 },
    { name: federationChunkName, priority: 1_000_000 },
    ...extraGroups,
  ]
  const config = { build: { rolldownOptions: { output: { codeSplitting: { groups } } } } }
  return { config: config as unknown as UserConfig, groups }
}

const MAP_KIT_WRAPPER_ID =
  '/repo/node_modules/__mf__virtual/sentinel_shell__loadShare___mf_0_sentinel_mf_1_map_mf_2_kit_mf_1_MapLibreMap_mf_2_vue__loadShare__.mjs'
const UI_WRAPPER_ID =
  '/repo/node_modules/__mf__virtual/sentinel_shell__loadShare___mf_0_sentinel_mf_1_ui_mf_1_base_mf_1_BaseButton_mf_2_vue__loadShare__.mjs'
const SHARE_HELPERS_ID =
  '/repo/node_modules/__mf__virtual/sentinel_shell__mf_v__loadShareHelpers__mf_v__.mjs'
const SHARE_TABLE_ID = '\0virtual:mf-localSharedImportMap'

/** One share table entry as `@module-federation/vite` 1.23 writes it. */
function shareEntry(key: string, materialize: boolean): string {
  return `
          ${JSON.stringify(key)}: {
            name: ${JSON.stringify(key)},
            version: "1.0.0",
            scope: ["default"],
            loaded: false,
            materialize: ${materialize},
            eager: false,
            from: "sentinel_shell",
            canLiveRebind: true,
            get () { return import("x") }
          }`
}

function shareTable(entries: string[]): string {
  return `const importMap = {${entries.join(',')}\n}\nexport const usedShared = importMap\n`
}

describe('lazyMapSharesPlugin', () => {
  it('runs after the federation plugin, and only in a build', () => {
    const plugin = lazyMapSharesPlugin()

    expect(plugin.enforce).toBe('post')
    expect(plugin.apply).toBe('build')
  })

  describe('chunks', () => {
    it('gives each map-kit share wrapper a chunk of its own, so it runs only when imported', () => {
      const { config, groups } = federatedBuildConfig()
      hook(lazyMapSharesPlugin(), 'config')(config)

      const federationGroup = groups.find((group) => group.priority === 1_000_000)!
      const name = federationGroup.name as (moduleId: string) => string | null

      expect(name(MAP_KIT_WRAPPER_ID)).toBe(
        'sentinel_shell__loadShare___mf_0_sentinel_mf_1_map_mf_2_kit_mf_1_MapLibreMap_mf_2_vue__loadShare__.mjs',
      )
    })

    it('leaves every other share wrapper in the merged startup chunk', () => {
      const { config, groups } = federatedBuildConfig()
      hook(lazyMapSharesPlugin(), 'config')(config)
      const name = groups.find((group) => group.priority === 1_000_000)!.name as (
        moduleId: string,
      ) => string | null

      expect(name(UI_WRAPPER_ID)).toBe('loadShare__shared')
    })

    it('leaves a module the federation plugin does not group ungrouped', () => {
      const { config, groups } = federatedBuildConfig()
      hook(lazyMapSharesPlugin(), 'config')(config)
      const name = groups.find((group) => group.priority === 1_000_000)!.name as (
        moduleId: string,
      ) => string | null

      expect(name('/repo/platform/web/map-kit/src/MapLibreMap.vue')).toBeNull()
    })

    it("keeps the federation plugin's name when a map-kit wrapper id has no file name to use", () => {
      const { config, groups } = federatedBuildConfig()
      hook(lazyMapSharesPlugin(), 'config')(config)
      const name = groups.find((group) => group.priority === 1_000_000)!.name as (
        moduleId: string,
      ) => string | null

      expect(name('__loadShare___mf_0_sentinel_mf_1_map_mf_2_kit_mf_1_/')).toBe('loadShare__shared')
    })

    it('claims the share helpers first, so no map-kit wrapper chunk captures them', () => {
      const { config, groups } = federatedBuildConfig([{ name: 'late', priority: 2_000_000 }])
      hook(lazyMapSharesPlugin(), 'config')(config)

      const helpers = groups[0]!
      expect(helpers.name).toBe('mf-share-helpers')
      expect(helpers.priority).toBe(2_000_001)
      expect(helpers.test!(SHARE_HELPERS_ID)).toBe(true)
      expect(helpers.test!(MAP_KIT_WRAPPER_ID)).toBe(false)
    })

    it.each([
      ['there is no build config', {}],
      ['the output is a list', { build: { rolldownOptions: { output: [] } } }],
      [
        'code splitting is off',
        { build: { rolldownOptions: { output: { codeSplitting: false } } } },
      ],
      ['there are no groups', { build: { rolldownOptions: { output: { codeSplitting: {} } } } }],
      [
        "no group is the federation plugin's",
        {
          build: {
            rolldownOptions: {
              output: { codeSplitting: { groups: [{ name: 'x', priority: 1_000_000 }] } },
            },
          },
        },
      ],
    ])('fails the build when %s', (_case, config) => {
      expect(() => hook(lazyMapSharesPlugin(), 'config')(config)).toThrow(
        "the federation plugin's chunk group is missing",
      )
    })
  })

  describe('share table', () => {
    it('stops init() loading map-kit and MapLibre, and only them', () => {
      const plugin = lazyMapSharesPlugin()
      const table = shareTable([
        shareEntry('vue', true),
        shareEntry('maplibre-gl', true),
        shareEntry('@sentinel/map-kit/MapLibreMap.vue', true),
        shareEntry('@sentinel/ui/base/BaseButton.vue', true),
      ])

      const result = hook(plugin, 'transform')(table, SHARE_TABLE_ID) as { code: string }

      const materialized = (key: string) =>
        new RegExp(`"${key.replace(/[/.]/g, '\\$&')}": \\{[^{}]*?materialize: (true|false)`).exec(
          result.code,
        )?.[1]
      expect(materialized('vue')).toBe('true')
      expect(materialized('@sentinel/ui/base/BaseButton.vue')).toBe('true')
      expect(materialized('maplibre-gl')).toBe('false')
      expect(materialized('@sentinel/map-kit/MapLibreMap.vue')).toBe('false')
    })

    it('leaves every other module alone', () => {
      const code = shareTable([shareEntry('maplibre-gl', true)])

      expect(hook(lazyMapSharesPlugin(), 'transform')(code, '/repo/src/main.ts')).toBeUndefined()
    })

    it('fails the build when the share table has no map entry to edit', () => {
      const table = shareTable([shareEntry('vue', true)])

      expect(() => hook(lazyMapSharesPlugin(), 'transform')(table, SHARE_TABLE_ID)).toThrow(
        'no map-kit or maplibre-gl entry',
      )
    })

    it('fails the build when the map entries are already unseeded (the shape changed)', () => {
      const table = shareTable([shareEntry('maplibre-gl', false)])

      expect(() => hook(lazyMapSharesPlugin(), 'transform')(table, SHARE_TABLE_ID)).toThrow(
        'no map-kit or maplibre-gl entry',
      )
    })

    it('fails the build when the share table never loaded', () => {
      expect(() => hook(lazyMapSharesPlugin(), 'buildEnd')()).toThrow(
        "the federation plugin's share table never loaded",
      )
    })

    it('passes a build that edited the share table', () => {
      const plugin = lazyMapSharesPlugin()
      hook(plugin, 'transform')(shareTable([shareEntry('maplibre-gl', true)]), SHARE_TABLE_ID)

      expect(() => hook(plugin, 'buildEnd')()).not.toThrow()
    })

    it("leaves a build that already failed with its own error, not this plugin's", () => {
      expect(() => hook(lazyMapSharesPlugin(), 'buildEnd')(new Error('earlier'))).not.toThrow()
    })
  })
})

describe('sectionFederationPlugin', () => {
  const guardOf = (option: PluginOption) =>
    flatten(option).find((plugin) => plugin.name === 'sentinel-remote-without-map')

  it('adds no map guard to a remote that draws a map', () => {
    expect(guardOf(sectionFederationPlugin('air'))).toBeUndefined()
  })

  describe('a remote built with usesMap: false', () => {
    const guard = guardOf(
      sectionFederationPlugin('sdr-manager-local', './src/register.ts', { usesMap: false }),
    )!

    it('is guarded before anything resolves', () => {
      expect(guard.enforce).toBe('pre')
    })

    it.each([
      'maplibre-gl',
      '@sentinel/map-kit/MapLibreMap.vue',
      '@sentinel/map-kit/utils/locationUtils',
    ])('fails its build when it imports %s', (source) => {
      expect(() => hook(guard, 'resolveId')(source, '/repo/src/register.ts')).toThrow(
        `sdr-manager-local is built with usesMap: false but /repo/src/register.ts imports ${source}`,
      )
    })

    it('names "a module" when the importer is unknown', () => {
      expect(() => hook(guard, 'resolveId')('maplibre-gl', undefined)).toThrow(
        'but a module imports maplibre-gl',
      )
    })

    it.each(['vue', '@sentinel/ui/base/BaseButton.vue', '@sentinel/shell-api/stores/app'])(
      'leaves %s to the other resolvers',
      (source) => {
        expect(hook(guard, 'resolveId')(source, '/repo/src/register.ts')).toBeUndefined()
      },
    )
  })
})

describe('sharedPackageModulesPlugin', () => {
  function load(id: string, federated = true): string {
    const plugin = sharedPackageModulesPlugin({ federated })
    const resolved = hook(plugin, 'resolveId')(id) as string
    return hook(plugin, 'load')(resolved) as string
  }

  it("imports every ui and shell-api module for every mode, and none of map-kit's", () => {
    const code = load(SHARED_PACKAGE_MODULES_ID)

    expect(code).toContain('"@sentinel/ui/base/BaseButton.vue"')
    expect(code).toContain('"@sentinel/shell-api/stores/app"')
    expect(code).not.toContain('@sentinel/map-kit/')
  })

  it("imports every map-kit module through the full app's own id", () => {
    const code = load(SHARED_MAP_KIT_MODULES_ID)

    expect(code).toContain('"@sentinel/map-kit/MapLibreMap.vue"')
    expect(code).not.toContain('@sentinel/ui/')
    expect(code).not.toContain('@sentinel/shell-api/')
  })

  it.each([SHARED_PACKAGE_MODULES_ID, SHARED_MAP_KIT_MODULES_ID])(
    'is empty without federation (%s)',
    (id) => {
      expect(load(id, false)).toBe('export default []\n')
    },
  )

  it('leaves every other id alone', () => {
    const plugin = sharedPackageModulesPlugin({ federated: true })

    expect(hook(plugin, 'resolveId')('vue')).toBeUndefined()
    expect(hook(plugin, 'load')('/repo/src/main.ts')).toBeUndefined()
  })
})
