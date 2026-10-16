import { describe, it, expect } from 'vitest'
import type { DocsPage } from '../docsTypes'
import { extractSearchSections } from './extractSearchSections'

function pageWith(markdown: string, overrides: Partial<DocsPage> = {}): DocsPage {
  return {
    path: 'operations',
    url: '/docs/operations',
    title: 'Operations',
    file: 'docs/operations.md',
    markdown,
    groupKey: 'getting-started',
    groupTitle: 'Getting started',
    ...overrides,
  }
}

describe('extractSearchSections', () => {
  it('returns no sections for an empty page', () => {
    expect(extractSearchSections(pageWith(''))).toEqual([])
  })

  it('returns no sections for a page that is only a title', () => {
    expect(extractSearchSections(pageWith('# Operations\n'))).toEqual([])
  })

  it('names the text above the first heading after the page, with the page path as its id', () => {
    const [intro] = extractSearchSections(pageWith('# Operations\n\nIntro words here.\n'))
    expect(intro).toEqual({
      id: 'operations',
      pagePath: 'operations',
      pageTitle: 'Operations',
      groupKey: 'getting-started',
      groupTitle: 'Getting started',
      heading: 'Operations',
      headingId: '',
      text: 'Intro words here.',
    })
  })

  it('starts a section at every heading with the anchor the page renders', () => {
    const sections = extractSearchSections(
      pageWith(
        '# Operations\n\nIntro.\n\n## Check logs\n\nLog text.\n\n### Health checks\n\nHealth text.\n',
      ),
    )
    expect(
      sections.map((section) => [section.id, section.heading, section.headingId, section.text]),
    ).toEqual([
      ['operations', 'Operations', '', 'Intro.'],
      ['operations#check-logs', 'Check logs', 'check-logs', 'Log text.'],
      ['operations#health-checks', 'Health checks', 'health-checks', 'Health text.'],
    ])
  })

  it('carries the page and group onto every section', () => {
    const sections = extractSearchSections(pageWith('# T\n\n## A\n\ntext\n'))
    for (const section of sections) {
      expect(section).toMatchObject({
        pagePath: 'operations',
        pageTitle: 'Operations',
        groupKey: 'getting-started',
        groupTitle: 'Getting started',
      })
    }
  })

  it('omits the intro when the page goes straight to a heading', () => {
    const sections = extractSearchSections(pageWith('# T\n\n## First\n\nbody\n'))
    expect(sections.map((section) => section.id)).toEqual(['operations#first'])
  })

  it('omits the intro when the page has no h1 and starts with a heading', () => {
    const sections = extractSearchSections(pageWith('## First\n\nbody\n'))
    expect(sections.map((section) => section.id)).toEqual(['operations#first'])
  })

  it('keeps a heading that has no text under it, so it can still be found by title', () => {
    const sections = extractSearchSections(pageWith('# T\n\n## Empty\n\n## Next\n\ntext\n'))
    expect(sections.map((section) => [section.heading, section.text])).toEqual([
      ['Empty', ''],
      ['Next', 'text'],
    ])
  })

  it('treats a second h1 as an ordinary section heading', () => {
    const sections = extractSearchSections(pageWith('# Title\n\n# Second\n\nbody\n'))
    expect(sections.map((section) => section.heading)).toEqual(['Second'])
  })

  it('numbers repeated headings exactly as the page does, counting the h1', () => {
    const sections = extractSearchSections(pageWith('# Setup\n\n## Setup\n\na\n\n## Setup\n\nb\n'))
    expect(sections.map((section) => section.headingId)).toEqual(['setup-1', 'setup-2'])
  })

  it('removes markup but keeps the words of inline text, links, emphasis and code spans', () => {
    const [section] = extractSearchSections(
      pageWith('# T\n\nRun `uv sync` and read **the** [guide](x.md) *now*.\n'),
    )
    expect(section?.text).toBe('Run uv sync and read the guide now.')
  })

  it('uses the plain text of a heading with markup', () => {
    const sections = extractSearchSections(pageWith('# T\n\n## Use `rtl_tcp` *now*\n\ntext\n'))
    expect(sections[0]?.heading).toBe('Use rtl_tcp now')
    expect(sections[0]?.headingId).toBe('use-rtl_tcp-now')
  })

  it('collapses whitespace and line breaks in the text', () => {
    const [section] = extractSearchSections(pageWith('# T\n\nline one\nline   two\n\nline three\n'))
    expect(section?.text).toBe('line one line two line three')
  })

  it('includes list items, table cells and block quotes', () => {
    const [section] = extractSearchSections(
      pageWith(
        '# T\n\n- first item\n- second item\n\n| head |\n| - |\n| cell |\n\n> quoted words\n',
      ),
    )
    expect(section?.text).toContain('first item')
    expect(section?.text).toContain('second item')
    expect(section?.text).toContain('head')
    expect(section?.text).toContain('cell')
    expect(section?.text).toContain('quoted words')
  })

  it('includes the content of code fences so commands can be found', () => {
    const [section] = extractSearchSections(
      pageWith('# T\n\n```bash\ndocker compose up --build\n```\n'),
    )
    expect(section?.text).toBe('docker compose up --build')
  })

  it('leaves mermaid source out of the text', () => {
    const [section] = extractSearchSections(
      pageWith('# T\n\nBefore.\n\n```mermaid\ngraph TD\n  Secret-->Node\n```\n\nAfter.\n'),
    )
    expect(section?.text).toBe('Before. After.')
  })

  it('does not treat a # line inside a code fence as a heading', () => {
    const sections = extractSearchSections(pageWith('# T\n\n```bash\n# a comment\n```\n'))
    expect(sections.map((section) => section.id)).toEqual(['operations'])
    expect(sections[0]?.text).toBe('# a comment')
  })

  it('uses the page title for the intro even when the h1 says something else', () => {
    const [intro] = extractSearchSections(
      pageWith('# Different h1\n\nbody\n', { title: 'Manifest title' }),
    )
    expect(intro?.heading).toBe('Manifest title')
    expect(intro?.pageTitle).toBe('Manifest title')
  })

  it('works for a page in a root-level file and nested path', () => {
    const [intro] = extractSearchSections(
      pageWith('# T\n\nbody\n', { path: 'adr/0006-x', file: 'docs/adr/0006-x.md' }),
    )
    expect(intro?.id).toBe('adr/0006-x')
  })
})
