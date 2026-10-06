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

const SHARED_PACKAGE_PREFIXES = Object.keys(SHARED_PACKAGES).map((name) => `${name}/`)

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Every module of the shared packages, as the specifier a section imports it
 * by: `.vue` files with their extension, `.ts` modules without. Specs, type
 * declarations and the `testing/` doubles are not app code and are left out.
 */
export function sharedPackageModuleSpecifiers(): string[] {
  const specifiers: string[] = []
  for (const [packageName, packageDir] of Object.entries(SHARED_PACKAGES)) {
    const sourceDir = resolve(REPO_ROOT, packageDir, 'src')
    for (const entry of readdirSync(sourceDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const path = relative(sourceDir, resolve(entry.parentPath, entry.name))
      if (/\.(spec|d)\.ts$/.test(path) || path.startsWith('testing/')) continue
      if (path.endsWith('.vue')) specifiers.push(`${packageName}/${path}`)
      else if (path.endsWith('.ts'))
        specifiers.push(`${packageName}/${path.slice(0, -'.ts'.length)}`)
    }
  }
  return specifiers.sort()
}

/** The id the shell imports to pull every shared package module into its build. */
export const SHARED_PACKAGE_MODULES_ID = 'virtual:sentinel-shared-package-modules'

/**
 * Resolves {@link SHARED_PACKAGE_MODULES_ID} to a module importing every shared
 * package module by its specifier — so the shell's build contains, and its
 * federation container provides, each one a section might use. Without
 * federation (dev server, tests) the shell imports the sections directly and
 * the module is empty.
 */
export function sharedPackageModulesPlugin(options: { federated: boolean }): Plugin {
  const resolvedId = `\0${SHARED_PACKAGE_MODULES_ID}`
  return {
    name: 'sentinel-shared-package-modules',
    resolveId: (id) => (id === SHARED_PACKAGE_MODULES_ID ? resolvedId : undefined),
    load(id) {
      if (id !== resolvedId) return undefined
      if (!options.federated) return 'export default []\n'
      const specifiers = sharedPackageModuleSpecifiers()
      const imports = specifiers.map(
        (specifier, index) => `import * as module${index} from ${JSON.stringify(specifier)}`,
      )
      const names = specifiers.map((_specifier, index) => `module${index}`)
      return `${imports.join('\n')}\nexport default [${names.join(', ')}]\n`
    },
  }
}

/**
 * The order the shell registers sections in: nav order, as they were composed
 * before federation. Registries that keep insertion order (settings sections,
 * footer items…) depend on it, so the section list is always sent in this
 * order; a section not named here sorts after these, alphabetically. The
 * backend's `GET /api/app/sections` uses the same order (backend/core/app_sections.py).
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

/** Federation container name for a section, e.g. `section_air` — a valid JS identifier. */
export function sectionRemoteName(sectionId: string): string {
  return `section_${sectionId}`
}

/** Where a section's remote is published, relative to the site root. */
export function sectionRemoteBase(sectionId: string): string {
  return `/remotes/${sectionId}/`
}

/** The file the shell loads to reach a section's remote. Served `no-cache`. */
export const REMOTE_ENTRY_FILENAME = 'remoteEntry.js'

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

/**
 * The federation remote plugin for a section: it exposes `./register` (the
 * section's `src/section.ts`, whose default export registers it with the
 * shell).
 */
export function sectionFederationPlugin(sectionId: string): PluginOption {
  const shared: Record<string, { singleton: true; import?: false }> = {}
  for (const name of HOST_PROVIDED_LIBRARIES) shared[name] = { singleton: true, import: false }
  for (const prefix of SHARED_PACKAGE_PREFIXES) shared[prefix] = { singleton: true, import: false }
  return federation({
    name: sectionRemoteName(sectionId),
    filename: REMOTE_ENTRY_FILENAME,
    exposes: { './register': './src/section.ts' },
    shared,
    dts: false,
  })
}
