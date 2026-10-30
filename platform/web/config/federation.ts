/**
 * Module Federation settings shared by the shell (the SPA, the federation host)
 * and every section remote (docs/plans/section-containers.md §3.6, P4).
 *
 * Both sides are built from this one module so they always agree on what is
 * shared and how: a mismatch would load a second Vue, Pinia or MapLibre and
 * silently split the app's state in two.
 */
import { federation } from '@module-federation/vite'
import { readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, PluginOption } from 'vite'

/**
 * Libraries the shell always loads and every section uses. A second copy of
 * any of them would break the app (two Vues, two Pinias — stores no longer
 * shared — or two MapLibres, whose worker URL and pmtiles protocol are set up
 * once by the shell), so sections never bundle their own: `import: false`.
 */
const HOST_PROVIDED_LIBRARIES = ['vue', 'vue-router', 'pinia', 'maplibre-gl'] as const

/** The host-provided libraries only a map uses. */
const MAP_LIBRARIES: ReadonlySet<string> = new Set(['maplibre-gl'])

/**
 * The shared workspace packages, as prefix shares: every `@sentinel/ui/…`,
 * `@sentinel/shell-api/…` and `@sentinel/map-kit/…` module is one instance
 * app-wide, and the shell is its only provider.
 *
 * The shell's build includes every module of these packages (see
 * {@link sharedPackageModulesPlugin}), not just the ones it uses itself, and
 * sections take them only from the shell (`import: false`). With fallback
 * copies in the remotes instead, two remotes loading in parallel could each
 * resolve a module the shell does not use before the other had registered
 * it, and run two copies of a registry or store.
 */
const SHARED_PACKAGES = {
  '@sentinel/ui': 'platform/web/ui',
  '@sentinel/shell-api': 'platform/web/shell-api',
  '@sentinel/map-kit': 'platform/web/map-kit',
} as const

type SharedPackageName = keyof typeof SHARED_PACKAGES

const SHARED_PACKAGE_NAMES = Object.keys(SHARED_PACKAGES) as SharedPackageName[]

const SHARED_PACKAGE_PREFIXES = SHARED_PACKAGE_NAMES.map((name) => `${name}/`)

const MAP_KIT_PREFIX = '@sentinel/map-kit/'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Every module of the shared packages (or of `packageNames`), as the specifier
 * a section imports it by: `.vue` files with their extension, `.ts` modules without. Specs, type
 * declarations and the `testing/` doubles are not app code and are left out,
 * and so are modules under a `lazy/` folder: a shared module loads them with a
 * dynamic `import()` (the Monaco code editor), so importing them here would put
 * them in the shell's startup bundle. They still end up in the shell's build,
 * as a chunk of their own, through that dynamic import.
 */
export function sharedPackageModuleSpecifiers(
  packageNames: readonly SharedPackageName[] = SHARED_PACKAGE_NAMES,
): string[] {
  const specifiers: string[] = []
  for (const packageName of packageNames) {
    const packageDir = SHARED_PACKAGES[packageName]
    const sourceDir = resolve(REPO_ROOT, packageDir, 'src')
    for (const entry of readdirSync(sourceDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const path = relative(sourceDir, resolve(entry.parentPath, entry.name))
      if (/\.(spec|d)\.ts$/.test(path) || path.startsWith('testing/')) continue
      if (path.split(/[\\/]/).includes('lazy')) continue
      if (path.endsWith('.vue')) specifiers.push(`${packageName}/${path}`)
      else if (path.endsWith('.ts'))
        specifiers.push(`${packageName}/${path.slice(0, -'.ts'.length)}`)
    }
  }
  return specifiers.sort()
}

/**
 * The id the shell imports to pull every `@sentinel/ui` and `@sentinel/shell-api`
 * module into its build — what the remotes of every app mode use.
 */
export const SHARED_PACKAGE_MODULES_ID = 'virtual:sentinel-shared-package-modules'

/**
 * The id that pulls in every `@sentinel/map-kit` module. Only the full app's
 * boot imports it, so SDR Manager-only mode, which has no map, never loads
 * map-kit or the MapLibre it imports (see {@link lazyMapSharesPlugin}).
 */
export const SHARED_MAP_KIT_MODULES_ID = 'virtual:sentinel-shared-map-kit-modules'

const SHARED_MODULE_GROUPS: Record<string, readonly SharedPackageName[]> = {
  [SHARED_PACKAGE_MODULES_ID]: ['@sentinel/ui', '@sentinel/shell-api'],
  [SHARED_MAP_KIT_MODULES_ID]: ['@sentinel/map-kit'],
}

/** The federation plugin's global module cache, where share wrappers park their pending loads. */
const MODULE_CACHE_GLOBAL = '__mf_module_cache__'

/**
 * `sharesReady`: settles once every share wrapper loading so far has bound its
 * module. A wrapper the shell loads after startup (map-kit's, made lazy by
 * {@link lazyMapSharesPlugin}) exports `undefined` until its load resolves,
 * and the plugin only awaits those loads before the shell's entry runs — not
 * for a chunk imported later, like the full app's boot. Loads that finish can
 * queue more (a module importing other map-kit modules), so it drains the list
 * until it stays empty.
 */
const SHARES_READY_SOURCE = `export const sharesReady = (async () => {
  const pending = globalThis[${JSON.stringify(MODULE_CACHE_GLOBAL)}]?.pendingShareLoads
  while (pending?.length) await Promise.all([...pending])
})()
`

/**
 * Resolves {@link SHARED_PACKAGE_MODULES_ID} and {@link SHARED_MAP_KIT_MODULES_ID}
 * to modules importing every module of their packages by its specifier — so the
 * shell's build contains, and its federation container provides, each one a
 * section might use — and exporting `sharesReady` ({@link SHARES_READY_SOURCE}).
 * Without federation (dev server, tests) the shell imports the sections
 * directly, both modules are empty and `sharesReady` is already resolved.
 */
export function sharedPackageModulesPlugin(options: { federated: boolean }): Plugin {
  const packagesByResolvedId = new Map(
    Object.entries(SHARED_MODULE_GROUPS).map(([id, packageNames]) => [`\0${id}`, packageNames]),
  )
  return {
    name: 'sentinel-shared-package-modules',
    resolveId: (id) => (id in SHARED_MODULE_GROUPS ? `\0${id}` : undefined),
    load(id) {
      const packageNames = packagesByResolvedId.get(id)
      if (packageNames === undefined) return undefined
      if (!options.federated)
        return 'export default []\nexport const sharesReady = Promise.resolve()\n'
      const specifiers = sharedPackageModuleSpecifiers(packageNames)
      const imports = specifiers.map(
        (specifier, index) => `import * as module${index} from ${JSON.stringify(specifier)}`,
      )
      const names = specifiers.map((_specifier, index) => `module${index}`)
      return `${imports.join('\n')}\nexport default [${names.join(', ')}]\n${SHARES_READY_SOURCE}`
    },
  }
}

/**
 * The order the shell registers sections in: nav order, as they were composed
 * before federation. Registries that keep insertion order (settings sections,
 * footer items…) depend on it, so the section list is always sent in this
 * order; a section not named here sorts after these, alphabetically. The
 * backend's `GET /api/app/sections` uses the same order (each section's `navOrder` in backend/modules/).
 */
export const SECTION_REGISTRATION_ORDER = ['air', 'space', 'sea', 'land', 'sdr'] as const

/** Sorts section ids into {@link SECTION_REGISTRATION_ORDER}. */
export function inRegistrationOrder(sectionIds: string[]): string[] {
  const rank = (sectionId: string): number => {
    const index = (SECTION_REGISTRATION_ORDER as readonly string[]).indexOf(sectionId)
    return index === -1 ? SECTION_REGISTRATION_ORDER.length : index
  }
  return [...sectionIds].sort(
    (first, second) => rank(first) - rank(second) || first.localeCompare(second),
  )
}

/**
 * Federation container name for a remote, e.g. `section_air` or
 * `section_sdr_manager_remote` — a valid JS identifier, so a dash in the id
 * becomes an underscore. The shell's loader (`sections.federated.ts`) derives
 * the same name.
 */
export function sectionRemoteName(sectionId: string): string {
  return `section_${sectionId.replaceAll('-', '_')}`
}

/** Where a section's remote is published, relative to the site root. */
export function sectionRemoteBase(sectionId: string): string {
  return `/remotes/${sectionId}/`
}

/** The file the shell loads to reach a section's remote. Served `no-cache`. */
export const REMOTE_ENTRY_FILENAME = 'remoteEntry.js'

/** The module a remote exposes as `./register`, relative to its package. */
export const DEFAULT_REGISTER_ENTRY = './src/section.ts'

/** The federation host plugin for the shell. Remotes are registered at runtime, never at build time. */
export function shellFederationPlugin(): PluginOption {
  const shared: Record<string, { singleton: true }> = {}
  for (const name of [...HOST_PROVIDED_LIBRARIES, ...SHARED_PACKAGE_PREFIXES]) {
    shared[name] = { singleton: true }
  }
  return federation({
    name: 'sentinel_shell',
    // The host's own entry (it provides the shared modules) goes with the
    // other hashed shell files: the backend serves /spa-assets/, and anything
    // else at the site root falls through to the SPA's index.html.
    filename: 'spa-assets/remoteEntry-[hash].js',
    remotes: {},
    shared,
    // Exposes no types; the generated-types step only fails without a tsconfig.
    dts: false,
  })
}

/** How the federation plugin spells `@sentinel/map-kit/` inside a share wrapper's module id. */
const MAP_KIT_WRAPPER_ID_MARKER = '__loadShare___mf_0_sentinel_mf_1_map_mf_2_kit_mf_1_'

/** Marks the plugin's shared-cache helpers module, which every share wrapper imports. */
const SHARE_HELPERS_ID_MARKER = '__mf_v__loadShareHelpers__mf_v__'

/** The plugin's generated table of the shares the shell provides (`usedShared`). */
const SHARE_TABLE_ID_MARKER = 'virtual:mf-localSharedImportMap'

/**
 * The shares only a map uses: every map-kit module and MapLibre. In the share
 * table their entries read `"<key>": { name: …, materialize: true,`.
 */
const MAP_SHARE_ENTRY =
  /("(?:@sentinel\/map-kit\/[^"]+|maplibre-gl)":\s*\{[^{}]*?materialize:\s*)true\b/g

/** The federation plugin's own chunk group: the one whose `name` is a function, at its priority. */
const FEDERATION_GROUP_PRIORITY = 1_000_000

type ChunkNameFunction = (moduleId: string, ...rest: unknown[]) => string | null | undefined

interface ChunkGroup {
  name?: string | ChunkNameFunction
  test?: (moduleId: string) => boolean
  priority?: number
}

/**
 * Makes the shell load map-kit and MapLibre only when something imports them,
 * so SDR Manager-only mode (ADR 0007), which has no map, never downloads them,
 * and the full app still does: its boot imports every map-kit module
 * ({@link SHARED_MAP_KIT_MODULES_ID}), and the sections import what they use.
 *
 * The federation plugin (`@module-federation/vite`) loads every module the
 * shell shares at startup, two ways, and this undoes both for the map's shares
 * only:
 * - **Seeding.** Its container's `init()` loads every share the shell's build
 *   imports (`materialize: true` in its share table). Marked `false`, a map
 *   share is left to whatever imports it first; the shell remains its only
 *   provider either way (remotes bring no copies), so it is still one instance.
 * - **Merged wrappers.** It merges the shell's share wrappers into one chunk,
 *   and each wrapper starts loading its module as soon as that chunk runs.
 *   Each map-kit wrapper gets a chunk of its own instead (named as the plugin
 *   names a wrapper it doesn't merge), so it runs only when imported. Rolldown
 *   also puts a group's dependencies in its chunk, so the helpers every wrapper
 *   imports get a chunk of their own, claimed first: otherwise they could land
 *   in a map-kit wrapper's chunk, which every other wrapper would then import.
 *
 * It must come after {@link shellFederationPlugin}. A build in which either
 * piece of the plugin's output can't be found fails, rather than quietly
 * loading the map in every mode again (e.g. after a plugin upgrade).
 */
export function lazyMapSharesPlugin(): Plugin {
  let shareTableSeen = false
  return {
    name: 'sentinel-lazy-map-shares',
    enforce: 'post',
    apply: 'build',
    config(config) {
      const output = config.build?.rolldownOptions?.output
      const codeSplitting = Array.isArray(output) ? undefined : output?.codeSplitting
      const groups: ChunkGroup[] =
        typeof codeSplitting === 'object' ? ((codeSplitting.groups as ChunkGroup[]) ?? []) : []
      const federationGroup = groups.find(
        (group) => typeof group.name === 'function' && group.priority === FEDERATION_GROUP_PRIORITY,
      )
      if (federationGroup === undefined || typeof federationGroup.name !== 'function') {
        throw new Error(
          "lazyMapSharesPlugin: the federation plugin's chunk group is missing; " +
            'is it after shellFederationPlugin, and has @module-federation/vite changed?',
        )
      }
      const federationChunkName = federationGroup.name
      federationGroup.name = (moduleId, ...rest) => {
        const chunkName = federationChunkName(moduleId, ...rest)
        if (!chunkName || !moduleId.includes(MAP_KIT_WRAPPER_ID_MARKER)) return chunkName
        return /([^/\\]+__loadShare__[^/\\]+)/.exec(moduleId)?.[1] ?? chunkName
      }
      groups.unshift({
        name: 'mf-share-helpers',
        test: (moduleId) => moduleId.includes(SHARE_HELPERS_ID_MARKER),
        priority: Math.max(...groups.map((group) => group.priority ?? 0)) + 1,
      })
    },
    transform(code, moduleId) {
      if (!moduleId.includes(SHARE_TABLE_ID_MARKER)) return undefined
      shareTableSeen = true
      const unseeded = code.replace(MAP_SHARE_ENTRY, '$1false')
      if (unseeded === code) {
        throw new Error(
          "lazyMapSharesPlugin: no map-kit or maplibre-gl entry in the federation plugin's " +
            'share table; has @module-federation/vite changed its shape?',
        )
      }
      return { code: unseeded, map: null }
    },
    buildEnd(error) {
      if (!error && !shareTableSeen) {
        throw new Error("lazyMapSharesPlugin: the federation plugin's share table never loaded")
      }
    },
  }
}

/**
 * The federation remote plugin for a section: it exposes `./register` (by
 * default the section's `src/section.ts`; an SDR Manager package names its
 * own `registerEntry`), whose default export registers it with the shell.
 *
 * A remote with no map (`usesMap: false`: sdr-manager-local) shares
 * neither MapLibre nor map-kit, so loading it — in SDR Manager-only mode, the
 * only remote loaded — never makes the shell load them (see
 * {@link lazyMapSharesPlugin}). Its build fails if it imports either after
 * all, since it would then bundle a second copy.
 */
export function sectionFederationPlugin(
  sectionId: string,
  registerEntry = DEFAULT_REGISTER_ENTRY,
  options: { usesMap?: boolean } = {},
): PluginOption {
  const usesMap = options.usesMap ?? true
  const shared: Record<string, { singleton: true; import?: false }> = {}
  for (const name of HOST_PROVIDED_LIBRARIES) {
    if (usesMap || !MAP_LIBRARIES.has(name)) shared[name] = { singleton: true, import: false }
  }
  for (const prefix of SHARED_PACKAGE_PREFIXES) {
    if (usesMap || prefix !== MAP_KIT_PREFIX) shared[prefix] = { singleton: true, import: false }
  }
  const federationPlugin = federation({
    name: sectionRemoteName(sectionId),
    filename: REMOTE_ENTRY_FILENAME,
    exposes: { './register': registerEntry },
    shared,
    dts: false,
  })
  if (usesMap) return federationPlugin
  const noMapImports: Plugin = {
    name: 'sentinel-remote-without-map',
    enforce: 'pre',
    resolveId(source, importer) {
      if (MAP_LIBRARIES.has(source) || source.startsWith(MAP_KIT_PREFIX)) {
        throw new Error(
          `${sectionId} is built with usesMap: false but ${importer ?? 'a module'} imports ${source}`,
        )
      }
      return undefined
    },
  }
  return [noMapImports, federationPlugin]
}
