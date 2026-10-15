import type { Token } from 'markdown-it'
import { markdownEngine, type DocsRenderEnvironment } from './markdownEngine.ts'
import { createHeadingSlugger } from './headingSlug.ts'
import { inlinePlainText } from './headingAnchors.ts'
import { sanitizeDocsHtml } from './sanitizeHtml'
import type {
  CalloutVariant,
  DocBlock,
  HeadingBlock,
  OutlineEntry,
  RenderedDocument,
} from './docBlocks'

/** The tokens of one top-level block, from its opening token to its closing one. */
type TokenGroup = Token[]

const ALERT_MARKER_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i
const FIGURE_CAPTION_PATTERN = /^Figure:\s*/i
const IN_WORDS_PATTERN = /^In words:?$/i

/**
 * Splits the token stream into its top-level blocks. Container tokens
 * (`nesting` 1 ... -1) are kept together with everything they contain.
 */
function groupTopLevelBlocks(tokens: Token[]): TokenGroup[] {
  const groups: TokenGroup[] = []
  let openGroup: TokenGroup | null = null
  for (const token of tokens) {
    if (openGroup) {
      openGroup.push(token)
      if (token.nesting === -1 && token.level === 0) {
        groups.push(openGroup)
        openGroup = null
      }
    } else if (token.nesting === 1) {
      openGroup = [token]
    } else {
      groups.push([token])
    }
  }
  return groups
}

function renderTokens(tokens: Token[], environment: DocsRenderEnvironment): string {
  return markdownEngine.renderer.render(tokens, markdownEngine.options, environment)
}

/**
 * An inline token's children without the empty text fragments markdown-it
 * leaves around emphasis, so `**In words:**` has the three children it appears
 * to have (open, text, close).
 */
function meaningfulChildren(inlineToken: Token | undefined): Token[] | undefined {
  return inlineToken?.children?.filter((child) => !(child.type === 'text' && child.content === ''))
}

/** The inline token of a paragraph group, if the group is a paragraph. */
function paragraphInline(group: TokenGroup): Token | undefined {
  return group[0]?.type === 'paragraph_open' ? group[1] : undefined
}

/** The text of an italic-only paragraph (`*Figure: ...*`), or null. */
function italicParagraphText(group: TokenGroup): string | null {
  const children = meaningfulChildren(paragraphInline(group))
  if (!children || children.length !== 3) return null
  if (children[0]?.type !== 'em_open' || children[2]?.type !== 'em_close') return null
  /* v8 ignore start -- the three children are checked above, so the middle one exists */
  return children[1]?.content ?? null
  /* v8 ignore stop */
}

/** True for a paragraph that is only `**In words:**`. */
function isInWordsLeadIn(group: TokenGroup): boolean {
  const children = meaningfulChildren(paragraphInline(group))
  if (!children || children.length !== 3) return false
  return (
    children[0]?.type === 'strong_open' &&
    children[2]?.type === 'strong_close' &&
    /* v8 ignore start -- the three children are checked above, so the middle one exists */
    IN_WORDS_PATTERN.test(children[1]?.content ?? '')
    /* v8 ignore stop */
  )
}

function isListOrTable(group: TokenGroup): boolean {
  const type = group[0]?.type
  return type === 'bullet_list_open' || type === 'ordered_list_open' || type === 'table_open'
}

/**
 * If the blockquote opens with a GitHub alert marker (`[!NOTE]`), removes the
 * marker from the tokens and returns the alert kind.
 */
function takeAlertVariant(group: TokenGroup): CalloutVariant | null {
  if (group[0]?.type !== 'blockquote_open') return null
  const paragraphOpen = group[1]
  const inline = group[2]
  const children = inline?.children
  if (paragraphOpen?.type !== 'paragraph_open' || !children?.length) return null
  const firstChild = children[0]
  const match = firstChild?.type === 'text' ? ALERT_MARKER_PATTERN.exec(firstChild.content) : null
  if (!match?.[1]) return null

  children.shift()
  if (children[0]?.type === 'softbreak') children.shift()
  if (children.length === 0) {
    // The marker stood alone on its line with the text in later paragraphs:
    // drop the now-empty paragraph (open, inline, close).
    group.splice(1, 3)
  }
  return match[1].toLowerCase() as CalloutVariant
}

/** An image alone in its paragraph is a figure; its title becomes the caption. */
function renderFigure(group: TokenGroup): string | null {
  const children = meaningfulChildren(paragraphInline(group))
  const image = children?.length === 1 ? children[0] : undefined
  if (image?.type !== 'image') return null
  const escape = markdownEngine.utils.escapeHtml
  /* v8 ignore start -- markdown-it always gives an image an src attribute */
  const source = escape(String(image.attrGet('src') ?? ''))
  /* v8 ignore stop */
  const altText = escape(image.content)
  const title = String(image.attrGet('title') ?? '')
  const linkName = altText === '' ? 'Open image full size' : `${altText} (opens full size)`
  return (
    `<figure class="doc-figure"><a href="${source}" target="_blank" rel="noopener noreferrer" ` +
    `aria-label="${linkName}"><img src="${source}" alt="${altText}"></a>` +
    (title ? `<figcaption>${escape(title)}</figcaption>` : '') +
    '</figure>'
  )
}

/** What one handler needs to turn a top-level group into blocks. */
interface GroupInput {
  /** Every top-level group of the page, in order. */
  groups: readonly TokenGroup[]
  /** Which of them is being handled. */
  index: number
  environment: DocsRenderEnvironment
  /** Anchor ids for headings; stateful because repeats are numbered in order. */
  slugify: (headingText: string) => string
  /** Index of the page's own h1 group, or -1. */
  pageHeadingIndex: number
  /** Text of the nearest heading above, for naming a table's scroll region. */
  nearestHeadingText: string
}

/** What a handler produced. */
interface GroupResult {
  blocks: DocBlock[]
  /** Extra groups after this one that were consumed with it (a diagram's "In words"). */
  consumedGroups?: number
  /** Set when the group was the page's own h1: its anchor id. */
  pageHeadingId?: string
}

type GroupHandler = (input: GroupInput) => GroupResult | null

function currentGroup(input: GroupInput): TokenGroup {
  return input.groups[input.index] as TokenGroup
}

function openingToken(group: TokenGroup): Token {
  return group[0] as Token
}

function isMermaidFence(group: TokenGroup | undefined): boolean {
  const opening = group?.[0]
  return opening?.type === 'fence' && opening.info.trim() === 'mermaid'
}

/** A heading. The page's first h1 becomes the page heading and is not a block. */
const handleHeading: GroupHandler = (input) => {
  const group = currentGroup(input)
  const opening = openingToken(group)
  if (opening.type !== 'heading_open') return null
  const inline = group[1]
  const text = inlinePlainText(inline)
  const id = input.slugify(text)
  if (input.index === input.pageHeadingIndex) return { blocks: [], pageHeadingId: id }
  // Any further h1 is demoted so every page has exactly one.
  const level = Math.min(Math.max(Number(opening.tag.slice(1)), 2), 6) as HeadingBlock['level']
  const html = sanitizeDocsHtml(
    markdownEngine.renderer.renderInline(
      /* v8 ignore start -- a heading's inline token always has children */
      inline?.children ?? [],
      /* v8 ignore stop */
      markdownEngine.options,
      input.environment,
    ),
  )
  return { blocks: [{ kind: 'heading', level, id, html, text }] }
}

/** A Mermaid fence, with the caption before it and the "In words" text after it. */
const handleDiagram: GroupHandler = (input) => {
  const group = currentGroup(input)
  if (!isMermaidFence(group)) return null
  const captionText = figureCaptionOf(input.groups[input.index - 1])
  const leadInGroup = input.groups[input.index + 1]
  const bodyGroup = input.groups[input.index + 2]
  const hasTextEquivalent =
    leadInGroup !== undefined &&
    bodyGroup !== undefined &&
    isInWordsLeadIn(leadInGroup) &&
    isListOrTable(bodyGroup)
  return {
    blocks: [
      {
        kind: 'diagram',
        source: openingToken(group).content.trimEnd(),
        caption: captionText?.replace(FIGURE_CAPTION_PATTERN, '') ?? '',
        textHtml: hasTextEquivalent
          ? sanitizeDocsHtml(renderTokens(bodyGroup, input.environment))
          : '',
      },
    ],
    consumedGroups: hasTextEquivalent ? 2 : 0,
  }
}

/** The `*Figure: ...*` text of a caption paragraph, or null if the group is not one. */
function figureCaptionOf(group: TokenGroup | undefined): string | null {
  if (!group) return null
  const italicText = italicParagraphText(group)
  return italicText !== null && FIGURE_CAPTION_PATTERN.test(italicText) ? italicText : null
}

/** A figure caption belongs to the diagram after it, so on its own it renders nothing. */
const handleDiagramCaption: GroupHandler = (input) => {
  if (figureCaptionOf(currentGroup(input)) === null) return null
  return isMermaidFence(input.groups[input.index + 1]) ? { blocks: [] } : null
}

/** A non-Mermaid fence at the top level. */
const handleCodeFence: GroupHandler = (input) => {
  const opening = openingToken(currentGroup(input))
  if (opening.type !== 'fence') return null
  return {
    blocks: [
      {
        kind: 'code',
        /* v8 ignore start -- split() always yields at least one element */
        language: opening.info.trim().split(/\s+/)[0] ?? '',
        /* v8 ignore stop */
        code: opening.content.replace(/\n$/, ''),
      },
    ],
  }
}

/** A table at the top level. */
const handleTable: GroupHandler = (input) => {
  const group = currentGroup(input)
  if (openingToken(group).type !== 'table_open') return null
  return {
    blocks: [
      {
        kind: 'table',
        html: sanitizeDocsHtml(renderTokens(group, input.environment)),
        label: `${input.nearestHeadingText} table`.trim(),
      },
    ],
  }
}

/** A `> [!NOTE]` style alert. A plain blockquote is not handled here. */
const handleCallout: GroupHandler = (input) => {
  const group = currentGroup(input)
  const variant = takeAlertVariant(group)
  if (variant === null) return null
  const contents = group.slice(1, -1)
  return {
    blocks: [
      {
        kind: 'callout',
        variant,
        html: sanitizeDocsHtml(renderTokens(contents, input.environment)),
      },
    ],
  }
}

/** A paragraph that is only an image. */
const handleFigure: GroupHandler = (input) => {
  const figureHtml = renderFigure(currentGroup(input))
  return figureHtml === null
    ? null
    : { blocks: [{ kind: 'html', html: sanitizeDocsHtml(figureHtml) }] }
}

/** Everything else: ordinary prose. */
const handleProse: GroupHandler = (input) => {
  const html = sanitizeDocsHtml(renderTokens(currentGroup(input), input.environment))
  /* v8 ignore start -- defensive: markdown-it produces no top-level block that renders to nothing */
  return { blocks: html.trim() === '' ? [] : [{ kind: 'html', html }] }
  /* v8 ignore stop */
}

/** Tried in order; the first that applies wins. */
const GROUP_HANDLERS: readonly GroupHandler[] = [
  handleHeading,
  handleDiagram,
  handleCodeFence,
  handleTable,
  handleCallout,
  handleFigure,
  handleDiagramCaption,
  handleProse,
]

/** Joins neighbouring prose blocks, so a run of paragraphs is one element. */
function mergeAdjacentProse(blocks: readonly DocBlock[]): DocBlock[] {
  const merged: DocBlock[] = []
  for (const block of blocks) {
    const previous = merged[merged.length - 1]
    if (block.kind === 'html' && previous?.kind === 'html') {
      merged[merged.length - 1] = { kind: 'html', html: previous.html + block.html }
    } else {
      merged.push(block)
    }
  }
  return merged
}

/** The h2 and h3 of a page, for "On this page". */
function outlineOf(blocks: readonly DocBlock[]): OutlineEntry[] {
  return blocks.flatMap((block) =>
    block.kind === 'heading' && (block.level === 2 || block.level === 3)
      ? [{ id: block.id, level: block.level, text: block.text }]
      : [],
  )
}

/**
 * Renders one markdown page into blocks.
 *
 * The page's first `# h1` is not emitted as a block: the page shows its own
 * heading component, which takes that heading's anchor id. Any further h1 is
 * demoted to an h2 so every page has exactly one h1.
 *
 * @param source Markdown text.
 * @param environment The file and library used to rewrite relative links.
 */
export function renderDocument(
  source: string,
  environment: DocsRenderEnvironment,
): RenderedDocument {
  const groups = groupTopLevelBlocks(markdownEngine.parse(source, environment))
  const slugify = createHeadingSlugger()
  const pageHeadingIndex = groups.findIndex(
    (group) => openingToken(group).type === 'heading_open' && openingToken(group).tag === 'h1',
  )
  const blocks: DocBlock[] = []
  let headingId = ''
  let nearestHeadingText = inlinePlainText(groups[pageHeadingIndex]?.[1])

  for (let index = 0; index < groups.length; index += 1) {
    const input: GroupInput = {
      groups,
      index,
      environment,
      slugify,
      pageHeadingIndex,
      nearestHeadingText,
    }
    for (const handle of GROUP_HANDLERS) {
      const result = handle(input)
      if (result === null) continue
      blocks.push(...result.blocks)
      headingId = result.pageHeadingId ?? headingId
      index += result.consumedGroups ?? 0
      const lastHeading = result.blocks.find((block) => block.kind === 'heading')
      if (lastHeading?.kind === 'heading') nearestHeadingText = lastHeading.text
      break
    }
  }

  const merged = mergeAdjacentProse(blocks)
  return { headingId, blocks: merged, outline: outlineOf(merged) }
}
