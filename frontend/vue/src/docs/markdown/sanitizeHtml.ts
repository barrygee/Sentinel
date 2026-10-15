import DOMPurify from 'dompurify'

/**
 * Sanitises the HTML markdown-it produced before it is rendered with `v-html`.
 *
 * The docs are our own markdown, but the renderer never trusts its output: the
 * allow-list is DOMPurify's defaults (no scripts, no event handlers, no
 * `javascript:` URLs) plus `target`, which external links need to open in a new
 * tab. The link's `rel="noopener noreferrer"` is kept by default.
 */
export function sanitizeDocsHtml(html: string): string {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}
