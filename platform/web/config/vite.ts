/**
 * Vite settings shared by the SPA (the shell), the section remote builds and
 * the web packages' tests.
 */
import vue from '@vitejs/plugin-vue'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type PluginOption, type UserConfig } from 'vite'
import {
  inRegistrationOrder,
  REMOTE_ENTRY_FILENAME,
  sectionFederationPlugin,
  sectionRemoteBase,
} from './federation.ts'

/**
 * Alias for `maplibre-contour`, resolved from the consumer's location.
 *
 * The package's `exports` map lists only "module"/"require"/"browser" (no
 * "import"/"default"), so Node-condition resolution (vitest) rejects it. An
 * absolute path to its ESM build bypasses the exports map for build and test.
 * It is located through Node's resolver because npm workspaces hoist it.
 *
 * @param consumerUrl `import.meta.url` of the config asking for the alias.
 */
export function maplibreContourAlias(consumerUrl: string): Record<string, string> {
  const requireFromConsumer = createRequire(consumerUrl)
  const distDirectory = dirname(requireFromConsumer.resolve('maplibre-contour'))
  return { 'maplibre-contour': resolve(distDirectory, 'index.mjs') }
}

/**
 * The Vue plugin as every Sentinel bundle compiles templates: absolute asset
 * URLs (`/assets/…`, `/frontend/…`) are left alone, because the backend serves
 * them at runtime — they are not modules to bundle.
 */
export function sentinelVuePlugin(): PluginOption {
  return vue({
    template: {
      transformAssetUrls: { img: [], link: [], video: [], source: [] },
    },
  })
}

/** The repository root, from this file's location (platform/web/config). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** Where the built shell lives; section remotes are published below it, under remotes/<id>/. */
export const SPA_DIST_DIR = resolve(REPO_ROOT, 'frontend/spa-dist')

/**
 * The production build of one section as a Module Federation remote, published
 * to `frontend/spa-dist/remotes/<id>/` and served from `/remotes/<id>/`.
 *
 * @param sectionId e.g. `air`.
 * @param packageUrl `import.meta.url` of the section's vite.config.ts.
 */
export function sentinelSectionViteConfig(sectionId: string, packageUrl: string): UserConfig {
  return defineConfig({
    base: sectionRemoteBase(sectionId),
    plugins: [sentinelVuePlugin(), sectionFederationPlugin(sectionId)],
    resolve: { alias: maplibreContourAlias(packageUrl) },
    build: {
      outDir: resolve(SPA_DIST_DIR, 'remotes', sectionId),
      emptyOutDir: true,
      // A federation remote is loaded by the shell, which needs only its entry.
      rolldownOptions: { input: {} },
    },
  })
}

/**
 * The section remotes built into `distDir/remotes/`, as `GET /api/app/sections`
 * lists them: those with a remote entry, in registration order.
 */
export function builtSections(distDir: string): Array<{ id: string; remoteEntry: string }> {
  const remotesDir = resolve(distDir, 'remotes')
  if (!existsSync(remotesDir)) return []
  const ids = readdirSync(remotesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((sectionId) => existsSync(resolve(remotesDir, sectionId, REMOTE_ENTRY_FILENAME)))
  return inRegistrationOrder(ids).map((sectionId) => ({
    id: sectionId,
    remoteEntry: `${sectionRemoteBase(sectionId)}${REMOTE_ENTRY_FILENAME}`,
  }))
}

/**
 * `vite preview` as a composed static server: besides the built shell and its
 * remotes (static files under remotes/<id>/), it answers `GET /api/app/sections`
 * from what is built — the one backend endpoint the shell needs before it can
 * show anything. The Playwright suite runs against this.
 */
export function sectionsPreviewPlugin(distDir: string): Plugin {
  return {
    name: 'sentinel-sections-preview',
    configurePreviewServer(server) {
      server.middlewares.use('/api/app/sections', (request, response, next) => {
        if (request.method !== 'GET') return next()
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ sections: builtSections(distDir) }))
      })
    },
  }
}

export { REMOTE_ENTRY_FILENAME }
