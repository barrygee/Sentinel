import { markdownEngine } from '../markdown/markdownEngine'
import { createHeadingSlugger } from '../markdown/headingSlug'
import { inlinePlainText } from '../markdown/headingAnchors'
import type { DocsPage } from '../docsTypes'

/** One searchable slice of a page: a heading and the text under it. */
export interface SearchSection {
  /** Unique id: `<page path>#<heading id>` (the page path alone for the intro). */
  id: string
  pagePath: string
  pageTitle: string
  groupKey: string
  groupTitle: string
  /** The heading this slice sits under, or the page title for the intro. */
  heading: string
  /** The heading's anchor id; empty for the text above the first heading. */
  headingId: string
  /** Plain text of the slice (markup removed). */
  text: string
}

/**
 * Splits a page's markdown by heading into searchable sections, using the same
 * anchors the page renders, so a result link lands on the right heading.
 * Diagram source is skipped (its words are in the "In words" text); code is
 * kept, since people search for a command or variable name.
 */
export function extractSearchSections(page: DocsPage): SearchSection[] {
  const tokens = markdownEngine.parse(page.markdown, {})
  const slugify = createHeadingSlugger()
  const sections: SearchSection[] = []
  let current: SearchSection = {
    id: page.path,
    pagePath: page.path,
    pageTitle: page.title,
    groupKey: page.groupKey,
    groupTitle: page.groupTitle,
    heading: page.title,
    headingId: '',
    text: '',
  }
  const textParts: string[] = []
  let sawPageHeading = false

  function closeCurrent(): void {
    current.text = textParts.join(' ').replace(/\s+/g, ' ').trim()
    textParts.length = 0
    if (current.text !== '' || current.headingId !== '') sections.push(current)
  }

  tokens.forEach((token, tokenIndex) => {
    if (token.type === 'heading_open') {
      const inline = tokens[tokenIndex + 1]
      /* v8 ignore start -- a heading_open token is always followed by its inline token */
      const headingText = inline ? inlinePlainText(inline) : ''
      /* v8 ignore stop */
      const headingId = slugify(headingText)
      if (token.tag === 'h1' && !sawPageHeading) {
        // The page's own title: the intro section is already named after the page.
        sawPageHeading = true
        return
      }
      closeCurrent()
      current = {
        ...current,
        id: `${page.path}#${headingId}`,
        heading: headingText,
        headingId,
        text: '',
      }
      return
    }
    // A heading's own text is the section's name, not part of what it says.
    const followsHeading = tokens[tokenIndex - 1]?.type === 'heading_open'
    if (token.type === 'inline' && !followsHeading) textParts.push(inlinePlainText(token))
    else if (token.type === 'fence' && token.info.trim() !== 'mermaid') {
      textParts.push(token.content)
    }
  })
  closeCurrent()
  return sections
}
