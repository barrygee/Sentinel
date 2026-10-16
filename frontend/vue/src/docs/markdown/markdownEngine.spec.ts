import { describe, it, expect } from 'vitest'
import { buildDocsLibrary } from '../docsNavigation'
import { markdownEngine, type DocsRenderEnvironment } from './markdownEngine'

const library = buildDocsLibrary(
  {
    groups: [
      {
        key: 'getting-started',
        title: 'Getting started',
        pages: [{ path: 'operations', title: 'Operations' }],
      },
    ],
  },
  { 'docs/operations.md': '# Operations' },
)

const environment: DocsRenderEnvironment = {
  file: 'docs/sections.md',
  pageUrl: '/docs/sections',
  library,
  imageUrls: { 'docs/images/map.png': '/spa-assets/map-1.png' },
}

function render(markdown: string, renderEnvironment: DocsRenderEnvironment = environment): string {
  return markdownEngine.render(markdown, { ...renderEnvironment })
}

describe('markdownEngine: raw HTML', () => {
  it('escapes raw HTML instead of passing it through', () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('does not turn bare URLs into links', () => {
    expect(render('see https://example.com now')).not.toContain('<a ')
  })
})

describe('markdownEngine: link rewriting', () => {
  it('points a link to another bundled doc at its in-app page and marks it for the router', () => {
    const html = render('[ops](operations.md#health)')
    expect(html).toContain('href="/docs/operations#health"')
    expect(html).toContain('data-doc-link')
    expect(html).not.toContain('target=')
  })

  it('points a #anchor link at the page being read', () => {
    const html = render('[jump](#install)')
    expect(html).toContain('href="/docs/sections#install"')
    expect(html).toContain('data-doc-link')
  })

  it('keeps a bare #anchor when the page url is unknown', () => {
    const html = render('[jump](#install)', { file: 'docs/sections.md', library })
    expect(html).toContain('href="#install"')
  })

  it('opens an external link in a new tab with noopener and a screen-reader note', () => {
    const html = render('[site](https://example.com/x)')
    expect(html).toContain('href="https://example.com/x"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('class="doc-external-glyph" aria-hidden="true"')
    expect(html).toContain('<span class="sr-only"> (opens in a new tab)</span>')
    expect(html).not.toContain('data-doc-link')
  })

  it('places the external-link marker straight after the closing link', () => {
    const html = render('[site](https://example.com)')
    expect(html).toMatch(/<a [^>]*>site<\/a><span class="doc-external-glyph"/)
  })

  it('marks an external link that wraps emphasis only once, after the whole link text', () => {
    const html = render('[the *big* site](https://example.com)')
    expect(html.match(/doc-external-glyph/g)).toHaveLength(1)
    expect(html).toMatch(/<em>big<\/em> site<\/a><span class="doc-external-glyph"/)
  })

  it('marks every external link in a paragraph', () => {
    const html = render('[a](https://a.example) and [b](https://b.example)')
    expect(html.match(/doc-external-glyph/g)).toHaveLength(2)
  })

  it('sends a link to an unbundled repo file to GitHub in a new tab', () => {
    const html = render('[readme](../README.md)')
    expect(html).toContain('href="https://github.com/barrygee/Sentinel/blob/main/README.md"')
    expect(html).toContain('target="_blank"')
  })

  it('leaves a mailto: link without a new-tab marker', () => {
    const html = render('[mail](mailto:me@example.com)')
    expect(html).toContain('href="mailto:me@example.com"')
    expect(html).not.toContain('target=')
    expect(html).not.toContain('doc-external-glyph')
  })

  it('rewrites links inside list items, headings and emphasis', () => {
    const html = render('- [ops](operations.md)\n\n## See [ops](operations.md)')
    expect(html.match(/href="\/docs\/operations"/g)).toHaveLength(2)
  })

  it('leaves links alone when parsed without a document (search indexing)', () => {
    const html = markdownEngine.render('[ops](operations.md) [x](https://example.com)', {})
    expect(html).toContain('href="operations.md"')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('doc-external-glyph')
  })

  it('leaves links alone when the environment has no library', () => {
    const html = render('[ops](operations.md)', { file: 'docs/sections.md' })
    expect(html).toContain('href="operations.md"')
  })

  it('leaves links alone when the environment has no file', () => {
    const html = render('[ops](operations.md)', { library })
    expect(html).toContain('href="operations.md"')
  })
})

describe('markdownEngine: images', () => {
  it('rewrites an image to its bundled URL', () => {
    expect(render('![map](images/map.png)')).toContain('src="/spa-assets/map-1.png"')
  })

  it('falls back to the GitHub raw file for an image that was not bundled', () => {
    expect(render('![x](images/gone.png)')).toContain(
      'src="https://raw.githubusercontent.com/barrygee/Sentinel/main/docs/images/gone.png"',
    )
  })

  it('handles an image with no image map in the environment', () => {
    const html = render('![map](images/map.png)', { file: 'docs/sections.md', library })
    expect(html).toContain('raw.githubusercontent.com')
  })

  it('leaves images alone when parsed without a file', () => {
    expect(markdownEngine.render('![map](images/map.png)', {})).toContain('src="images/map.png"')
  })
})

describe('markdownEngine: nested code blocks and tables get their own scroll region', () => {
  it('wraps a fence nested in a list item in a focusable, named group', () => {
    const html = render('- step\n\n  ```bash\n  docker compose up\n  ```\n')
    expect(html).toContain(
      '<div class="doc-nested-scroll" role="group" tabindex="0" aria-label="bash code">',
    )
    expect(html).toContain('docker compose up')
    expect(html.indexOf('doc-nested-scroll')).toBeLessThan(html.indexOf('<pre'))
    expect(html.indexOf('</pre>')).toBeLessThan(html.lastIndexOf('</div>'))
  })

  it('names a nested fence with no language "Code code"', () => {
    const html = render('- step\n\n  ```\n  plain\n  ```\n')
    expect(html).toContain('aria-label="Code code"')
  })

  it('uses only the first word of the info string as the language', () => {
    const html = render('- step\n\n  ```ts title="x"\n  const a = 1\n  ```\n')
    expect(html).toContain('aria-label="ts code"')
  })

  it('escapes the language so it cannot break out of the attribute', () => {
    const html = render('- step\n\n  ```"><script>x\n  code\n  ```\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain('aria-label="&quot;&gt;&lt;script&gt;x code"')
  })

  it('wraps a table nested in a list item in a scroll group named "Table"', () => {
    const html = render('- item\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |\n')
    expect(html).toContain(
      '<div class="doc-nested-scroll" role="group" tabindex="0" aria-label="Table"><table>',
    )
    expect(html).toContain('</table>\n</div>')
  })

  it('wraps a table nested in a block quote too', () => {
    const html = render('> | a |\n> | - |\n> | 1 |\n')
    expect(html).toContain('aria-label="Table"')
  })

  it('does not wrap a top-level table (its component does that)', () => {
    const html = render('| a | b |\n| - | - |\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
    expect(html).not.toContain('doc-nested-scroll')
  })

  it('opens and closes exactly one wrapper per nested table', () => {
    const html = render('- item\n\n  | a |\n  | - |\n  | 1 |\n')
    expect(html.match(/<div class="doc-nested-scroll"/g)).toHaveLength(1)
    expect(html.match(/<\/div>/g)).toHaveLength(1)
  })
})
