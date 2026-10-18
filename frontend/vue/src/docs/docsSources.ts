import { buildDocsLibrary } from './docsNavigation'
import type { DocsLibrary } from './docsTypes'

/**
 * The documentation source: the docs service (`services/docs/backend`, compose
 * service `docs`), fetched when the `/docs` route first opens.
 *
 * The markdown is the repo's own `docs/**` plus the root `CONTRIBUTING.md`, so
 * the in-app docs and the files on GitHub are the same text; `docs/plans/**`
 * and the changelog are left out by the service. It answers with the menu
 * (`docs/nav.json`), every page's markdown and the list of images, which it
 * serves itself — none of it is in the shell's bundle any more.
 */
const LIBRARY_URL = '/api/documentation/library'
const IMAGES_URL = '/api/documentation/images/'
const IMAGES_FOLDER = 'docs/images/'

/** Body of `GET /api/documentation/library`. */
interface DocsLibraryResponse {
  navigation: unknown
  documents: Record<string, string>
  images: string[]
}

/** The docs service is missing, down, or answered with something that is not a library. */
export class DocsUnavailableError extends Error {
  constructor(reason: string) {
    super(`the documentation could not be loaded: ${reason}`)
    this.name = 'DocsUnavailableError'
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  )
}

function isLibraryResponse(body: unknown): body is DocsLibraryResponse {
  if (typeof body !== 'object' || body === null) return false
  const { documents, images } = body as Record<string, unknown>
  return (
    isStringRecord(documents) &&
    Array.isArray(images) &&
    images.every((image) => typeof image === 'string')
  )
}

/**
 * Image URLs keyed by repo-relative file (`docs/images/x.png`), each served by
 * the docs service. Path segments are encoded so a file name is never read as
 * part of the URL's structure.
 */
function imageUrlsOf(images: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    images
      .filter((image) => image.startsWith(IMAGES_FOLDER))
      .map((image) => [
        image,
        IMAGES_URL + image.slice(IMAGES_FOLDER.length).split('/').map(encodeURIComponent).join('/'),
      ]),
  )
}

/** A loaded documentation set: the validated library and where its images are served. */
interface LoadedDocs {
  library: DocsLibrary
  imageUrls: Readonly<Record<string, string>>
}

let loaded: LoadedDocs | undefined
let loading: Promise<LoadedDocs> | undefined

async function fetchDocs(): Promise<LoadedDocs> {
  let body: unknown
  try {
    const response = await fetch(LIBRARY_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    body = await response.json()
  } catch (error) {
    throw new DocsUnavailableError(error instanceof Error ? error.message : String(error))
  }
  if (!isLibraryResponse(body)) throw new DocsUnavailableError('unexpected response')
  // Throws `DocsNavigationError` when docs/nav.json names a page that is not
  // there, so a typo in the menu fails loudly instead of shipping a dead page.
  return {
    library: buildDocsLibrary(body.navigation, body.documents),
    imageUrls: imageUrlsOf(body.images),
  }
}

/**
 * Fetches the documentation set, once per page load: later calls share the
 * first one. A failed load is forgotten, so opening Docs again retries (the
 * docs service may have come up since).
 *
 * @throws DocsUnavailableError when the docs service cannot be reached or
 *   answers with something that is not a library.
 * @throws DocsNavigationError when `docs/nav.json` does not match the files.
 */
export function loadDocsLibrary(): Promise<DocsLibrary> {
  if (loaded) return Promise.resolve(loaded.library)
  loading ??= fetchDocs().then(
    (docs) => {
      loaded = docs
      return docs
    },
    (error: unknown) => {
      loading = undefined
      throw error
    },
  )
  return loading.then((docs) => docs.library)
}

/**
 * The loaded documentation set. Only valid once `loadDocsLibrary()` has
 * resolved: the docs route renders its page only after that.
 *
 * @throws DocsUnavailableError before the library has loaded.
 */
export function getDocsLibrary(): DocsLibrary {
  if (!loaded) throw new DocsUnavailableError('not loaded yet')
  return loaded.library
}

/** The loaded set's image URLs keyed by repo-relative file (`docs/images/x.png`); empty before it loads. */
export function getDocsImageUrls(): Readonly<Record<string, string>> {
  return loaded?.imageUrls ?? {}
}

/** Drops the loaded library so a spec can load another. Not used by the app. */
export function resetDocsLibraryCache(): void {
  loaded = undefined
  loading = undefined
}
