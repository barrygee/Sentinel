import { describe, it, expect } from 'vitest'
import { buildDocsLibrary } from '../docsNavigation'
import type { DocBlock, HeadingBlock } from './docBlocks'
import { renderDocument } from './renderDocument'

const library = buildDocsLibrary(
  {
    groups: [
      {
        key: 'set-up-and-run',
        title: 'Set up and run',
        pages: [{ path: 'operations', title: 'Operations' }],
      },
    ],
  },
  { 'docs/operations.md': '# Operations' },
)

function render(markdown: string) {
  return renderDocument(markdown, {
    file: 'docs/sections.md',
    pageUrl: '/doc/sections',
    library,
    imageUrls: { 'docs/images/map.png': '/spa-assets/map-1.png' },
  })
}

/** Parses the html of the given prose blocks, to assert on elements rather than strings. */
function domOf(blocks: readonly DocBlock[]): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = blocks
    .map((block) => (block.kind === 'html' || block.kind === 'heading' ? block.html : ''))
    .join('')
  return container
}

function kinds(blocks: readonly DocBlock[]): string[] {
  return blocks.map((block) => block.kind)
}

function headings(blocks: readonly DocBlock[]): HeadingBlock[] {
  return blocks.filter((block): block is HeadingBlock => block.kind === 'heading')
}

describe('renderDocument: empty and headings', () => {
  it('renders an empty document as no blocks, no outline and no heading id', () => {
    expect(render('')).toEqual({ headingId: '', blocks: [], outline: [] })
  })

  it('takes the first h1 as the page heading and does not emit it as a block', () => {
    const rendered = render('# Where recordings are saved\n\nSome text.\n')
    expect(rendered.headingId).toBe('where-recordings-are-saved')
    expect(kinds(rendered.blocks)).toEqual(['html'])
  })

  it('has no heading id when the page has no h1', () => {
    expect(render('Just text.\n').headingId).toBe('')
  })

  it('demotes any further h1 to an h2 so a page has exactly one h1', () => {
    const rendered = render('# Title\n\n# Second\n')
    expect(headings(rendered.blocks)).toEqual([
      { kind: 'heading', level: 2, id: 'second', html: 'Second', text: 'Second' },
    ])
  })

  it('demotes an h1 when the page has no earlier h1 only after the first', () => {
    const rendered = render('## Intro\n\n# First h1\n\n# Second h1\n')
    expect(headings(rendered.blocks).map((heading) => [heading.text, heading.level])).toEqual([
      ['Intro', 2],
      ['Second h1', 2],
    ])
    expect(rendered.headingId).toBe('first-h1')
  })

  it('keeps h2 to h6 levels, ids and plain text', () => {
    const rendered = render('# T\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n')
    expect(headings(rendered.blocks).map((heading) => [heading.level, heading.id])).toEqual([
      [2, 'two'],
      [3, 'three'],
      [4, 'four'],
      [5, 'five'],
      [6, 'six'],
    ])
  })

  it('numbers repeated headings the way GitHub does, counting the h1', () => {
    const rendered = render('# Setup\n\n## Setup\n\n## Setup\n')
    expect(rendered.headingId).toBe('setup')
    expect(headings(rendered.blocks).map((heading) => heading.id)).toEqual(['setup-1', 'setup-2'])
  })

  it('gives a heading sanitised inline html and separate plain text', () => {
    const [heading] = headings(render('# T\n\n## Use `rtl_tcp` *now*\n').blocks)
    expect(heading?.html).toBe('Use <code>rtl_tcp</code> <em>now</em>')
    expect(heading?.text).toBe('Use rtl_tcp now')
  })

  it('builds the outline from h2 and h3 only, in order', () => {
    const rendered = render('# T\n\n## A\n\n### B\n\n#### C\n\n## D\n')
    expect(rendered.outline).toEqual([
      { id: 'a', level: 2, text: 'A' },
      { id: 'b', level: 3, text: 'B' },
      { id: 'd', level: 2, text: 'D' },
    ])
  })
})

describe('renderDocument: prose', () => {
  it('merges neighbouring prose into one block', () => {
    const rendered = render('# T\n\nOne.\n\nTwo.\n\n- a\n- b\n')
    expect(rendered.blocks).toHaveLength(1)
    const [block] = rendered.blocks
    expect(block?.kind === 'html' && block.html).toContain('<p>One.</p>')
    expect(block?.kind === 'html' && block.html).toContain('<p>Two.</p>')
    expect(block?.kind === 'html' && block.html).toContain('<li>a</li>')
  })

  it('splits prose at a heading', () => {
    const rendered = render('# T\n\nBefore.\n\n## H\n\nAfter.\n')
    expect(kinds(rendered.blocks)).toEqual(['html', 'heading', 'html'])
  })

  it('renders a plain block quote as prose, not a callout', () => {
    const rendered = render('> Just a quote\n')
    expect(kinds(rendered.blocks)).toEqual(['html'])
    expect(JSON.stringify(rendered.blocks)).toContain('<blockquote>')
  })

  it('renders a horizontal rule as prose', () => {
    const rendered = render('Before\n\n---\n\nAfter\n')
    expect(kinds(rendered.blocks)).toEqual(['html'])
    expect(JSON.stringify(rendered.blocks)).toContain('<hr>')
  })

  it('rewrites links in prose, lists and headings', () => {
    const rendered = render('# T\n\nSee [ops](operations.md).\n\n## About [ops](operations.md)\n')
    const prose = rendered.blocks[0]
    expect(prose?.kind === 'html' && prose.html).toContain('href="/doc/operations"')
    expect(headings(rendered.blocks)[0]?.html).toContain('href="/doc/operations"')
  })
})

describe('renderDocument: sanitising', () => {
  it('shows raw script tags as text, never as markup', () => {
    const rendered = render(
      '# T\n\n<script>alert(1)</script>\n\nHello <img src=x onerror=alert(1)>\n',
    )
    const output = JSON.stringify(rendered.blocks)
    expect(output).not.toContain('<script')
    expect(output).not.toContain('<img')
    expect(output).toContain('&lt;script&gt;')
  })

  it('never emits a javascript: link, however it is written', () => {
    const rendered = render(
      '# T\n\n[a](javascript:alert(1)) [b](JAVASCRIPT:alert(2)) [c](&#106;avascript:alert(3))\n\n## [d](javascript:alert(4))\n',
    )
    const dom = domOf(rendered.blocks)
    expect(dom.querySelectorAll('a')).toHaveLength(0)
    expect(JSON.stringify(rendered.blocks)).not.toMatch(/href="javascript/i)
  })

  it('shows markup typed into a heading as text, never as elements', () => {
    const [heading] = headings(render('# T\n\n## <b onclick="x()">bold</b>\n').blocks)
    const dom = domOf([{ kind: 'html', html: heading?.html ?? '' }])
    expect(dom.querySelector('b')).toBeNull()
    expect(dom.textContent).toBe('<b onclick="x()">bold</b>')
  })

  it('shows scripts and image handlers in tables and callouts as text, never as elements', () => {
    const rendered = render(
      '# T\n\n| a |\n| - |\n| <script>x</script> |\n\n> [!NOTE]\n> <img src=x onerror=alert(1)>\n',
    )
    const dom = domOf(
      rendered.blocks.map((block) => ({
        kind: 'html' as const,
        html: block.kind === 'table' || block.kind === 'callout' ? block.html : '',
      })),
    )
    expect(dom.querySelector('script, img')).toBeNull()
    expect(dom.textContent).toContain('<script>x</script>')
    expect(dom.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('renderDocument: code', () => {
  it('turns a top-level fence into a code block with its language', () => {
    const rendered = render('# T\n\n```bash\ndocker compose up\n```\n')
    expect(rendered.blocks).toEqual([{ kind: 'code', language: 'bash', code: 'docker compose up' }])
  })

  it('keeps blank lines and indentation inside the code, and drops only the final newline', () => {
    const rendered = render('```\n  a\n\n  b\n```\n')
    expect(rendered.blocks).toEqual([{ kind: 'code', language: '', code: '  a\n\n  b' }])
  })

  it('uses the first word of the info string as the language', () => {
    const [block] = render('```ts title="x"\nconst a = 1\n```\n').blocks
    expect(block?.kind === 'code' && block.language).toBe('ts')
  })

  it('does not escape code (the component prints it as text)', () => {
    const [block] = render('```html\n<div class="a">&</div>\n```\n').blocks
    expect(block?.kind === 'code' && block.code).toBe('<div class="a">&</div>')
  })

  it('leaves a fence nested in a list to the prose, wrapped in a scroll group', () => {
    const rendered = render('- step\n\n  ```bash\n  ls\n  ```\n')
    expect(kinds(rendered.blocks)).toEqual(['html'])
    expect(JSON.stringify(rendered.blocks)).toContain('doc-nested-scroll')
  })
})

describe('renderDocument: tables', () => {
  const table = '| a | b |\n| - | - |\n| 1 | 2 |\n'

  it('emits a table block named after the nearest heading', () => {
    const rendered = render(`# Title\n\n## Environment variables\n\n${table}`)
    const block = rendered.blocks.find((candidate) => candidate.kind === 'table')
    expect(block?.kind === 'table' && block.label).toBe('Environment variables table')
    expect(block?.kind === 'table' && block.html).toContain('<table>')
    expect(block?.kind === 'table' && block.html).not.toContain('doc-nested-scroll')
  })

  it('uses the page title for a table before any other heading', () => {
    const [block] = render(`# Page title\n\n${table}`).blocks
    expect(block?.kind === 'table' && block.label).toBe('Page title table')
  })

  it('uses the latest heading for each table', () => {
    const rendered = render(`# T\n\n## First\n\n${table}\n## Second\n\n${table}`)
    const labels = rendered.blocks.flatMap((block) => (block.kind === 'table' ? [block.label] : []))
    expect(labels).toEqual(['First table', 'Second table'])
  })

  it('names a table "table" when the page has no heading at all', () => {
    const [block] = render(table).blocks
    expect(block?.kind === 'table' && block.label).toBe('table')
  })

  it('rewrites links in a table', () => {
    const [block] = render('| a |\n| - |\n| [ops](operations.md) |\n').blocks
    expect(block?.kind === 'table' && block.html).toContain('href="/doc/operations"')
  })
})

describe('renderDocument: callouts', () => {
  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'])('recognises [!%s]', (kind) => {
    const [block] = render(`> [!${kind}]\n> Be careful.\n`).blocks
    expect(block?.kind).toBe('callout')
    expect(block?.kind === 'callout' && block.variant).toBe(kind.toLowerCase())
    expect(block?.kind === 'callout' && block.html).toContain('Be careful.')
    expect(block?.kind === 'callout' && block.html).not.toContain('[!')
  })

  it('recognises the marker in any case', () => {
    const [block] = render('> [!warning]\n> Mind the gap.\n').blocks
    expect(block?.kind === 'callout' && block.variant).toBe('warning')
  })

  it('removes the marker line and keeps later paragraphs', () => {
    const [block] = render('> [!TIP]\n>\n> First.\n>\n> Second.\n').blocks
    expect(block?.kind === 'callout' && block.html).toBe('<p>First.</p>\n<p>Second.</p>\n')
  })

  it('keeps lists and inline markup inside a callout', () => {
    const [block] = render('> [!NOTE]\n> - one **bold**\n> - two\n').blocks
    expect(block?.kind === 'callout' && block.html).toContain('<li>one <strong>bold</strong></li>')
  })

  it('yields an empty callout for a marker with nothing after it', () => {
    const [block] = render('> [!NOTE]\n').blocks
    expect(block).toEqual({ kind: 'callout', variant: 'note', html: '' })
  })

  it('does not treat a quote that opens with emphasis or a link as a callout', () => {
    expect(kinds(render('> *[!NOTE]* text\n').blocks)).toEqual(['html'])
    expect(kinds(render('> [link](x.md)\n').blocks)).toEqual(['html'])
  })

  it('does not treat an unknown marker as a callout', () => {
    expect(kinds(render('> [!DANGER]\n> x\n').blocks)).toEqual(['html'])
  })

  it('does not treat a marker followed by text on the same line as a callout', () => {
    expect(kinds(render('> [!NOTE] inline text\n').blocks)).toEqual(['html'])
  })

  it('does not treat a marker that is not first in the quote as a callout', () => {
    expect(kinds(render('> intro\n>\n> [!NOTE]\n> x\n').blocks)).toEqual(['html'])
  })

  it('does not treat an empty or list-first block quote as a callout', () => {
    expect(kinds(render('>\n').blocks)).not.toContain('callout')
    expect(kinds(render('> - [!NOTE]\n').blocks)).toEqual(['html'])
  })
})

describe('renderDocument: figures', () => {
  it('renders an image alone in its paragraph as a figure linking to the full-size image', () => {
    const [block] = render('![A map of the UK](images/map.png)\n').blocks
    expect(block?.kind === 'html' && block.html).toBe(
      '<figure class="doc-figure"><a href="/spa-assets/map-1.png" target="_blank" rel="noopener noreferrer" aria-label="A map of the UK (opens full size)"><img src="/spa-assets/map-1.png" alt="A map of the UK"></a></figure>',
    )
  })

  it('uses the image title as a caption', () => {
    const [block] = render('![Map](images/map.png "UK coverage")\n').blocks
    expect(block?.kind === 'html' && block.html).toContain('<figcaption>UK coverage</figcaption>')
  })

  it('names the link generically when the image has no alt text', () => {
    const [block] = render('![](images/map.png)\n').blocks
    expect(block?.kind === 'html' && block.html).toContain('aria-label="Open image full size"')
    expect(block?.kind === 'html' && block.html).toContain('alt=""')
  })

  it('keeps markup in alt text and titles as text', () => {
    const [block] = render('![a "quoted" <b>](images/map.png "t<i>")\n').blocks
    const dom = domOf(block ? [block] : [])
    expect(dom.querySelector('b, i')).toBeNull()
    expect(dom.querySelector('img')?.getAttribute('alt')).toBe('a "quoted" <b>')
    expect(dom.querySelector('a')?.getAttribute('aria-label')).toBe(
      'a "quoted" <b> (opens full size)',
    )
    expect(dom.querySelector('figcaption')?.textContent).toBe('t<i>')
  })

  it('leaves an image inside a sentence as ordinary prose', () => {
    const [block] = render('See ![map](images/map.png) here.\n').blocks
    expect(block?.kind === 'html' && block.html).not.toContain('doc-figure')
    expect(block?.kind === 'html' && block.html).toContain('<img')
  })

  it('does not make a figure of a paragraph with two images', () => {
    const [block] = render('![a](images/map.png) ![b](images/map.png)\n').blocks
    expect(block?.kind === 'html' && block.html).not.toContain('doc-figure')
  })
})

describe('renderDocument: diagrams', () => {
  const diagram = '```mermaid\ngraph TD\n  A-->B\n```\n'

  it('turns a mermaid fence into a diagram block with trimmed source', () => {
    const [block] = render(diagram).blocks
    expect(block).toEqual({
      kind: 'diagram',
      source: 'graph TD\n  A-->B',
      caption: '',
      textHtml: '',
    })
  })

  it('takes the caption from the italic Figure line before the fence and renders no text for it', () => {
    const rendered = render(`# T\n\n*Figure: How the sections talk*\n\n${diagram}`)
    expect(rendered.blocks).toHaveLength(1)
    expect(rendered.blocks[0]).toMatchObject({
      kind: 'diagram',
      caption: 'How the sections talk',
    })
  })

  it('accepts the Figure label in any case, with or without a space', () => {
    const [block] = render(`*figure:Lower case*\n\n${diagram}`).blocks
    expect(block?.kind === 'diagram' && block.caption).toBe('Lower case')
  })

  it('takes the text equivalent from the list after "In words"', () => {
    const rendered = render(
      `*Figure: Flow*\n\n${diagram}\n**In words:**\n\n- A sends to B\n- B replies\n`,
    )
    expect(rendered.blocks).toHaveLength(1)
    const [block] = rendered.blocks
    expect(block?.kind === 'diagram' && block.textHtml).toContain('<li>A sends to B</li>')
    expect(block?.kind === 'diagram' && block.textHtml).toContain('<li>B replies</li>')
  })

  it('accepts a lead-in without the colon, in any case, and a numbered list or table', () => {
    const numbered = render(`${diagram}\n**in words**\n\n1. first\n2. second\n`).blocks[0]
    expect(numbered?.kind === 'diagram' && numbered.textHtml).toContain('<ol>')
    const tabular = render(`${diagram}\n**In words:**\n\n| a |\n| - |\n| 1 |\n`).blocks[0]
    expect(tabular?.kind === 'diagram' && tabular.textHtml).toContain('<table>')
  })

  it('does not repeat the text equivalent as prose after the diagram', () => {
    const rendered = render(`${diagram}\n**In words:**\n\n- only here\n\nAfter.\n`)
    expect(kinds(rendered.blocks)).toEqual(['diagram', 'html'])
    const prose = rendered.blocks[1]
    expect(prose?.kind === 'html' && prose.html).toBe('<p>After.</p>\n')
  })

  it('leaves the lead-in as prose when no list or table follows it', () => {
    const rendered = render(`${diagram}\n**In words:**\n\nJust a paragraph.\n`)
    expect(kinds(rendered.blocks)).toEqual(['diagram', 'html'])
    expect(rendered.blocks[0]).toMatchObject({ textHtml: '' })
  })

  it('leaves the lead-in as prose when nothing follows it at all', () => {
    const rendered = render(`${diagram}\n**In words:**\n`)
    expect(kinds(rendered.blocks)).toEqual(['diagram', 'html'])
    expect(rendered.blocks[0]).toMatchObject({ textHtml: '' })
  })

  it('does not take a different bold lead-in as the text equivalent', () => {
    const rendered = render(`${diagram}\n**Summary:**\n\n- x\n`)
    expect(rendered.blocks[0]).toMatchObject({ textHtml: '' })
    expect(kinds(rendered.blocks)).toEqual(['diagram', 'html'])
  })

  it('does not take an italic line that is not a Figure caption as a caption, and keeps it as prose', () => {
    const rendered = render(`*Just emphasis*\n\n${diagram}`)
    expect(kinds(rendered.blocks)).toEqual(['html', 'diagram'])
    expect(rendered.blocks[1]).toMatchObject({ caption: '' })
  })

  it('keeps a Figure caption as prose when no diagram follows it', () => {
    const rendered = render('*Figure: Orphan*\n\nText.\n')
    expect(kinds(rendered.blocks)).toEqual(['html'])
    expect(JSON.stringify(rendered.blocks)).toContain('Figure: Orphan')
  })

  it('does not treat italic text mixed with other text as a caption', () => {
    const rendered = render(`Mixed *Figure: x* text\n\n${diagram}`)
    expect(kinds(rendered.blocks)).toEqual(['html', 'diagram'])
    expect(rendered.blocks[1]).toMatchObject({ caption: '' })
  })

  it('does not take a list straight after the diagram as its text version', () => {
    const rendered = render(`${diagram}\n- one\n- two\n\nAfter.\n`)
    expect(kinds(rendered.blocks)).toEqual(['diagram', 'html'])
    expect(rendered.blocks[0]).toMatchObject({ textHtml: '' })
    const prose = rendered.blocks[1]
    expect(prose?.kind === 'html' && prose.html).toContain('<li>one</li>')
  })

  it('does not treat bold lead-in text with extra words as "In words"', () => {
    const rendered = render(`${diagram}\n**In words and more**\n\n- x\n`)
    expect(rendered.blocks[0]).toMatchObject({ textHtml: '' })
  })

  it('leaves other fenced languages as code', () => {
    expect(kinds(render('```mermaidish\nx\n```\n').blocks)).toEqual(['code'])
  })

  it('sanitises the text equivalent', () => {
    const [block] = render(`${diagram}\n**In words:**\n\n- <script>x</script> ok\n`).blocks
    expect(block?.kind === 'diagram' && block.textHtml).not.toContain('<script')
  })
})
