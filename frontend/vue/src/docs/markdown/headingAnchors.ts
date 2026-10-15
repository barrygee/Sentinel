import type { Token } from 'markdown-it'
import { createHeadingSlugger } from './headingSlug.ts'
import { markdownEngine } from './markdownEngine.ts'

/**
 * Heading anchors computed by the one code path the app and the CI link check
 * share, so a link the check accepts lands on the same heading in the app. The
 * relative `.ts` imports are deliberate: the check runs on Node's built-in
 * TypeScript support, which needs real extensions.
 */

/** A heading of a document and the anchor id GitHub (and the app) give it. */
export interface HeadingAnchor {
  id: string
  /** 1 to 6. */
  level: number
  text: string
}

/** The text of an inline token with markup removed (code spans keep their text). */
export function inlinePlainText(inlineToken: Token | undefined): string {
  if (!inlineToken?.children) return inlineToken?.content ?? ''
  return inlineToken.children
    .map((child) => {
      if (child.type === 'text' || child.type === 'code_inline' || child.type === 'image') {
        return child.content
      }
      return child.type === 'softbreak' || child.type === 'hardbreak' ? ' ' : ''
    })
    .join('')
}

/** Every heading of a markdown document, in order, with its anchor id. */
export function collectHeadingAnchors(markdown: string): HeadingAnchor[] {
  const slugify = createHeadingSlugger()
  const tokens = markdownEngine.parse(markdown, {})
  return tokens.flatMap((token, tokenIndex) => {
    if (token.type !== 'heading_open') return []
    const text = inlinePlainText(tokens[tokenIndex + 1])
    return [{ id: slugify(text), level: Number(token.tag.slice(1)), text }]
  })
}
