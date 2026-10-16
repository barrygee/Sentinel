import createMarkdownIt, { type MarkdownIt, type StateCore, type Token } from 'markdown-it'
import { resolveDocsImage, resolveDocsLink } from './docLinks.ts'
import type { DocsLibrary } from '../docsTypes'

/**
 * What the engine needs to know about the document being parsed so it can
 * rewrite links and images. Search indexing parses without it and leaves the
 * links alone.
 */
// A type alias, not an interface: markdown-it's `Env` is an index-signature record,
// and only aliases are assignable to one.
export type DocsRenderEnvironment = {
  /** Repo-relative file of the document, e.g. `docs/adr/0006-section-containers.md`. */
  file?: string
  /** URL of the page being read (`/docs/operations`), the target of `#anchor` links. */
  pageUrl?: string
  library?: DocsLibrary
  imageUrls?: Readonly<Record<string, string>>
}

const EXTERNAL_LINK_SUFFIX =
  '<span class="doc-external-glyph" aria-hidden="true">↗</span>' +
  '<span class="sr-only"> (opens in a new tab)</span>'

/**
 * Points one link at its in-app or external target.
 *
 * @returns True when the link opens in a new tab, so the caller adds the
 *   external-link marker after the link text.
 */
function rewriteLinkOpen(token: Token, environment: DocsRenderEnvironment): boolean {
  const { file, pageUrl, library } = environment
  const rawHref = token.attrGet('href')
  if (rawHref === null || file === undefined || library === undefined) return false
  const resolved = resolveDocsLink(String(rawHref), file, library)
  if (resolved.kind === 'page') {
    token.attrSet('href', resolved.page.url + resolved.hash)
    // Marks a link the article should route in-app instead of reloading.
    token.attrSet('data-doc-link', '')
    return false
  }
  if (resolved.kind === 'hash') {
    token.attrSet('href', (pageUrl ?? '') + resolved.hash)
    token.attrSet('data-doc-link', '')
    return false
  }
  token.attrSet('href', resolved.href)
  if (!resolved.opensNewTab) return false
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return true
}

/**
 * Core rule: after inline parsing, points links at the in-app pages (or GitHub,
 * or the open web) and images at their bundled files. External links get a
 * visual arrow and a screen-reader note that they open in a new tab.
 */
function rewriteLinksAndImages(state: StateCore): void {
  const environment = state.env as DocsRenderEnvironment
  for (const blockToken of state.tokens) {
    if (blockToken.type !== 'inline' || !blockToken.children) continue
    const children = blockToken.children
    // Walk backwards so inserting the external-link suffix does not shift
    // the indices still to be visited.
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      /* v8 ignore start -- index is always within children; this narrows the type for noUncheckedIndexedAccess */
      if (!child) continue
      /* v8 ignore stop */
      if (child.type === 'image' && environment.file !== undefined) {
        /* v8 ignore start -- markdown-it always gives an image an src attribute */
        const src = String(child.attrGet('src') ?? '')
        /* v8 ignore stop */
        child.attrSet('src', resolveDocsImage(src, environment.file, environment.imageUrls ?? {}))
      } else if (child.type === 'link_open') {
        if (!rewriteLinkOpen(child, environment)) continue
        const closeIndex = children.findIndex(
          (candidate, candidateIndex) => candidateIndex > index && candidate.type === 'link_close',
        )
        /* v8 ignore start -- markdown-it always pairs a link_open with a link_close */
        if (closeIndex === -1) continue
        /* v8 ignore stop */
        const suffix = new state.Token('html_inline', '', 0)
        suffix.content = EXTERNAL_LINK_SUFFIX
        children.splice(closeIndex + 1, 0, suffix)
      }
    }
  }
}

/**
 * Fences and tables nested inside a list item or quote are not lifted out into
 * `DocsCodeBlock`/`DocsTableScroll` (only top-level ones are), so the renderer
 * gives them the same safety directly: a keyboard-focusable, named scroll
 * group (not a landmark: repeated names such as "bash code" would fail axe's
 * landmark-unique), so a long line or wide table scrolls inside itself instead of
 * widening the page. Top-level tables (level 0) are left alone because their
 * component already wraps them.
 */
function wrapNestedBlocksInScrollRegions(engine: MarkdownIt): void {
  const renderFence = engine.renderer.rules.fence
  const renderTableOpen = engine.renderer.rules.table_open
  const renderTableClose = engine.renderer.rules.table_close
  const escape = engine.utils.escapeHtml
  const regionOpen = (label: string): string =>
    `<div class="doc-nested-scroll" role="group" tabindex="0" aria-label="${escape(label)}">`

  engine.renderer.rules.fence = (tokens, index, options, environment, renderer) => {
    const token = tokens[index] as Token
    /* v8 ignore start -- split() always yields one element, and markdown-it always defines the fence rule */
    const language = token.info.trim().split(/\s+/)[0] ?? ''
    const code = renderFence ? renderFence(tokens, index, options, environment, renderer) : ''
    /* v8 ignore stop */
    return `${regionOpen(`${language || 'Code'} code`)}${code}</div>`
  }
  engine.renderer.rules.table_open = (tokens, index, options, environment, renderer) => {
    const token = tokens[index] as Token
    /* v8 ignore start -- markdown-it defines no table_open rule, so the else arm is the one used; the other keeps a plugin's rule if one is ever added */
    const table = renderTableOpen
      ? renderTableOpen(tokens, index, options, environment, renderer)
      : renderer.renderToken(tokens, index, options)
    /* v8 ignore stop */
    return token.level === 0 ? table : `${regionOpen('Table')}${table}`
  }
  engine.renderer.rules.table_close = (tokens, index, options, environment, renderer) => {
    const token = tokens[index] as Token
    /* v8 ignore start -- as for table_open above */
    const table = renderTableClose
      ? renderTableClose(tokens, index, options, environment, renderer)
      : renderer.renderToken(tokens, index, options)
    /* v8 ignore stop */
    return token.level === 0 ? table : `${table}</div>`
  }
}

function createEngine(): MarkdownIt {
  // `html: false`: the docs never need raw HTML, and refusing it at the parser
  // is the first of two lines of defence (the sanitiser is the second).
  const engine = createMarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
  })
  engine.core.ruler.push('docs_rewrite_links', rewriteLinksAndImages)
  wrapNestedBlocksInScrollRegions(engine)
  return engine
}

/** The one markdown-it instance the docs feature uses. */
export const markdownEngine: MarkdownIt = createEngine()
