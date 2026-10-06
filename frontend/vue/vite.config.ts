import { defineConfig } from 'vite'
import { resolve } from 'path'
import { sharedPackageModulesPlugin, shellFederationPlugin } from '@sentinel/web-config/federation'
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
      ...(federated ? [shellFederationPlugin()] : []),
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
    build: {
      outDir: '../../frontend/spa-dist',
      emptyOutDir: true,
      // Output JS/CSS bundles under /spa-assets/ to avoid clashing with the
      // /assets/ static mount (map tiles, PMTiles, sprites) served by FastAPI.
      assetsDir: 'spa-assets',
    },
  }
})
