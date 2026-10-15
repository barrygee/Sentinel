/**
 * What `renderDocument` turns a markdown page into: an ordered list of blocks.
 *
 * Plain prose stays sanitised HTML, but anything that needs behaviour (code
 * with a copy button, scrollable tables, callouts, lazily drawn diagrams,
 * heading anchors) is its own block, so each is rendered by a small Vue
 * component instead of being patched into a string of HTML afterwards.
 */

/** The five GitHub alert kinds a `> [!KIND]` blockquote can declare. */
export type CalloutVariant = 'note' | 'tip' | 'important' | 'warning' | 'caution'

/** Sanitised prose: paragraphs, lists, plain quotes, figures. */
export interface HtmlBlock {
  kind: 'html'
  html: string
}

/** An h2-h6 heading with its GitHub-compatible anchor id. */
export interface HeadingBlock {
  kind: 'heading'
  level: 2 | 3 | 4 | 5 | 6
  id: string
  /** Sanitised inline HTML (code spans, emphasis). */
  html: string
  /** Plain text, for the anchor's accessible name. */
  text: string
}

/** A fenced code block. */
export interface CodeBlock {
  kind: 'code'
  /** The info string's language, or an empty string. */
  language: string
  code: string
}

/** A table, to be wrapped in a keyboard-focusable scroll region. */
export interface TableBlock {
  kind: 'table'
  html: string
  /** Accessible name for the scroll region: the nearest heading plus "table". */
  label: string
}

/** A GitHub alert rendered as a note. */
export interface CalloutBlock {
  kind: 'callout'
  variant: CalloutVariant
  html: string
}

/** A Mermaid diagram, its caption and its "In words" text equivalent. */
export interface DiagramBlock {
  kind: 'diagram'
  /** The Mermaid source from the fence. */
  source: string
  /** From the italic `*Figure: ...*` line before the fence; empty if absent. */
  caption: string
  /** Sanitised HTML of the list/table after `**In words:**`; empty if absent. */
  textHtml: string
}

/** Any block of a rendered page. */
export type DocBlock =
  | HtmlBlock
  | HeadingBlock
  | CodeBlock
  | TableBlock
  | CalloutBlock
  | DiagramBlock

/** One entry of the "On this page" outline (h2 and h3). */
export interface OutlineEntry {
  id: string
  level: 2 | 3
  text: string
}

/** A fully rendered page. */
export interface RenderedDocument {
  /** Anchor id of the page's own h1, so `#the-title` links still land. */
  headingId: string
  blocks: DocBlock[]
  outline: OutlineEntry[]
}
