import { defineConfig } from 'vite'
import { resolve } from 'path'
import {
  lazyMapSharesPlugin,
  sharedPackageModulesPlugin,
  shellFederationPlugin,
} from '@sentinel/web-config/federation'
import {
  maplibreContourAlias,
  sectionsPreviewPlugin,
  sentinelVuePlugin,
} from '@sentinel/web-config/vite'

/**
 * The shell's Vite config.
 *
 * `vite build` produces the federated app: the shell is a Module Federation
 * host and loads each section as a remote (built separately into
 * spa-dist/remotes/<id>/ by `npm run build`), by swapping `shell/sections`
 * for `shell/sections.federated`. The dev server and tests import the section
 * packages directly instead, so HMR and vitest see one ordinary module graph.
 * SENTINEL_SECTIONS=static forces the direct imports into a build too.
 */
export default defineConfig(({ command }) => {
  const federated = command === 'build' && process.env.SENTINEL_SECTIONS !== 'static'
  return {
    plugins: [
      sentinelVuePlugin(),
      // map-kit and MapLibre load only when imported, so SDR Manager-only
      // mode never downloads the map (federation.ts).
      ...(federated ? [shellFederationPlugin(), lazyMapSharesPlugin()] : []),
      // The shell provides every shared-package module to the sections (main.ts).
      sharedPackageModulesPlugin({ federated }),
      // `vite preview` (the e2e server) also answers GET /api/app/sections.
      sectionsPreviewPlugin(resolve(__dirname, '../../frontend/spa-dist')),
    ],
    resolve: {
      alias: [
        ...(federated
          ? [
              {
                find: /^(\.|@)\/shell\/sections$/,
                replacement: resolve(__dirname, 'src/shell/sections.federated.ts'),
              },
            ]
          : []),
        { find: '@', replacement: resolve(__dirname, 'src') },
        // See maplibreContourAlias for why maplibre-contour needs an alias.
        ...Object.entries(maplibreContourAlias(import.meta.url)).map(([find, replacement]) => ({
          find,
          replacement,
        })),
      ],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:8080',
          ws: true,
        },
        '/assets': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/frontend': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    // `vite preview` serves the Playwright e2e suite, and by default it inherits
    // `server.proxy` above — so any /api or /ws call a spec doesn't mock went on
    // to whatever answers on :8080, which on a dev machine is the live stack
    // (a stray DELETE would remove real data). An explicit empty proxy keeps
    // the suite self-contained: an unmocked call now fails, as it does in CI.
    preview: {
      proxy: {},
    },
    build: {
      outDir: '../../frontend/spa-dist',
      emptyOutDir: true,
      // Output JS/CSS bundles under /spa-assets/ to avoid clashing with the
      // /assets/ static mount (map tiles, PMTiles, sprites) served by FastAPI.
      assetsDir: 'spa-assets',
    },
  }
})
