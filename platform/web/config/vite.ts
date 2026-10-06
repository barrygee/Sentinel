/**
 * Vite resolve settings shared by the SPA build and the web packages' tests.
 */
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

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
