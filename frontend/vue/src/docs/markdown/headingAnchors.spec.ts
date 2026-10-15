import { describe, it, expect } from 'vitest'
import type { Token } from 'markdown-it'
import { markdownEngine } from './markdownEngine'
import { collectHeadingAnchors, inlinePlainText } from './headingAnchors'

function inlineTokenOf(markdown: string): Token {
  const token = markdownEngine.parse(markdown, {}).find((candidate) => candidate.type === 'inline')
  if (!token) throw new Error('no inline token')
  return token
}

describe('inlinePlainText', () => {
  it('returns an empty string for no token', () => {
    expect(inlinePlainText(undefined)).toBe('')
  })

  it('returns the content of a token with no children', () => {
    expect(inlinePlainText({ children: null, content: 'raw' } as unknown as Token)).toBe('raw')
  })

  it('removes emphasis, strong and link markup but keeps their text', () => {
    expect(inlinePlainText(inlineTokenOf('A *bold* and **strong** [link](x.md)'))).toBe(
      'A bold and strong link',
    )
  })

  it('keeps the text of code spans without the backticks', () => {
    expect(inlinePlainText(inlineTokenOf('Use `rtl_tcp` now'))).toBe('Use rtl_tcp now')
  })

  it('uses an image alt text', () => {
    expect(inlinePlainText(inlineTokenOf('See ![the map](a.png) here'))).toBe('See the map here')
  })

  it('turns soft and hard breaks into a space', () => {
    expect(inlinePlainText(inlineTokenOf('one\ntwo'))).toBe('one two')
    expect(inlinePlainText(inlineTokenOf('one  \ntwo'))).toBe('one two')
  })
})

describe('collectHeadingAnchors', () => {
  it('lists every heading with its level, text and GitHub anchor', () => {
    const anchors = collectHeadingAnchors('# Title\n\nText\n\n## Install `uv`\n\n### Step *one*\n')
    expect(anchors).toEqual([
      { id: 'title', level: 1, text: 'Title' },
      { id: 'install-uv', level: 2, text: 'Install uv' },
      { id: 'step-one', level: 3, text: 'Step one' },
    ])
  })

  it('numbers repeated headings the way GitHub does', () => {
    const anchors = collectHeadingAnchors('## Setup\n\n## Setup\n')
    expect(anchors.map((anchor) => anchor.id)).toEqual(['setup', 'setup-1'])
  })

  it('returns nothing for a document without headings', () => {
    expect(collectHeadingAnchors('Just a paragraph.\n')).toEqual([])
    expect(collectHeadingAnchors('')).toEqual([])
  })

  it('ignores a # line inside a code fence', () => {
    expect(collectHeadingAnchors('```bash\n# comment\n```\n')).toEqual([])
  })

  it('finds headings inside block quotes and lists', () => {
    const anchors = collectHeadingAnchors('> ## Quoted\n')
    expect(anchors.map((anchor) => anchor.id)).toEqual(['quoted'])
  })
})
