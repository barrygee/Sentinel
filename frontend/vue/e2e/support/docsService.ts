import type { Page } from '@playwright/test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The docs service (`services/docs/backend`, `sentinel_docs`) as the e2e suite
 * sees it: the preview server has no backend, so its two routes are answered
 * here from the repo's own `docs/` and `CONTRIBUTING.md`, the same files and
 * the same response shape (`sentinel_docs.library.read_library`). The specs
 * therefore still read the real docs, as they did when they were bundled.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const docsDirectory = join(repositoryRoot, 'docs')
const imagesDirectory = join(docsDirectory, 'images')
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(entryPath) : [entryPath]
  })
}

function repoRelative(path: string): string {
  return relative(repositoryRoot, path).split(sep).join('/')
}

/** Body of `GET /api/documentation/library`, built from the checkout. */
function libraryResponse(): string {
  const markdownFiles = filesUnder(docsDirectory)
    .filter((path) => path.endsWith('.md') && !repoRelative(path).startsWith('docs/plans/'))
    .concat(join(repositoryRoot, 'CONTRIBUTING.md'))
  const images = filesUnder(imagesDirectory)
    .filter((path) => extname(path).toLowerCase() in IMAGE_CONTENT_TYPES)
    .map(repoRelative)
  return JSON.stringify({
    navigation: JSON.parse(readFileSync(join(docsDirectory, 'nav.json'), 'utf8')) as unknown,
    documents: Object.fromEntries(
      markdownFiles.map((path) => [repoRelative(path), readFileSync(path, 'utf8')]),
    ),
    images,
  })
}

/** Core's `GET /api/app/docs` and the docs service's routes, for a deployment that includes it. */
export async function installDocsServiceMocks(page: Page): Promise<void> {
  await page.route('/api/app/docs', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ deployed: true, available: true }),
    })
  })
  await page.route('/api/documentation/library', (route) => {
    void route.fulfill({ contentType: 'application/json', body: libraryResponse() })
  })
  await page.route('/api/documentation/images/**', (route) => {
    const requested = decodeURIComponent(
      new URL(route.request().url()).pathname.replace('/api/documentation/images/', ''),
    )
    const image = resolve(imagesDirectory, requested)
    const contentType = IMAGE_CONTENT_TYPES[extname(image).toLowerCase()]
    if (!image.startsWith(imagesDirectory + sep) || !contentType || !existsSync(image)) {
      void route.fulfill({ status: 404 })
      return
    }
    void route.fulfill({ contentType, body: readFileSync(image) })
  })
}
