import { describe, it, expect } from 'vitest'
import { buildDocsLibrary } from '../docsNavigation'
import {
  CHANGELOG_URL,
  REPOSITORY_URL,
  resolveDocsImage,
  resolveDocsLink,
  resolveRepoPath,
} from './docLinks'

const library = buildDocsLibrary(
  {
    groups: [
      {
        key: 'set-up-and-run',
        title: 'Set up and run',
        pages: [
          { path: 'operations', title: 'Operations' },
          { path: 'adr/0006-section-containers', title: 'ADR 6' },
        ],
      },
      {
        key: 'develop',
        title: 'Develop',
        pages: [{ path: 'contributing', title: 'Contributing', file: 'CONTRIBUTING.md' }],
      },
    ],
  },
  {
    'docs/operations.md': '# Operations',
    'docs/adr/0006-section-containers.md': '# ADR',
    'CONTRIBUTING.md': '# Contributing',
  },
)

describe('constants', () => {
  it('derives the changelog address from the repository address', () => {
    expect(CHANGELOG_URL).toBe(`${REPOSITORY_URL}/blob/main/CHANGELOG.md`)
  })
})

describe('resolveRepoPath', () => {
  it('resolves a sibling against the folder of the source file', () => {
    expect(resolveRepoPath('docs/operations.md', 'radio-host.md')).toBe('docs/radio-host.md')
  })

  it('collapses ./ and ../ segments', () => {
    expect(resolveRepoPath('docs/adr/0006.md', '../operations.md')).toBe('docs/operations.md')
    expect(resolveRepoPath('docs/adr/0006.md', './x/./y.md')).toBe('docs/adr/x/y.md')
  })

  it('reaches the repo root from a nested file', () => {
    expect(resolveRepoPath('docs/adr/0006.md', '../../README.md')).toBe('README.md')
  })

  it('clamps a path that escapes the repo root', () => {
    expect(resolveRepoPath('docs/a.md', '../../../../etc/passwd')).toBe('etc/passwd')
  })

  it('treats a leading slash as the repo root', () => {
    expect(resolveRepoPath('docs/adr/x.md', '/README.md')).toBe('README.md')
  })

  it('ignores empty segments from doubled slashes', () => {
    expect(resolveRepoPath('docs/a.md', 'b//c.md')).toBe('docs/b/c.md')
  })

  it('resolves from a file at the repo root', () => {
    expect(resolveRepoPath('CONTRIBUTING.md', 'docs/operations.md')).toBe('docs/operations.md')
  })
})

describe('resolveDocsLink', () => {
  it('keeps a #anchor on the page being read', () => {
    expect(resolveDocsLink('#install', 'docs/operations.md', library)).toEqual({
      kind: 'hash',
      hash: '#install',
    })
  })

  it('turns a relative link to a bundled doc into that page', () => {
    const resolved = resolveDocsLink(
      '../operations.md',
      'docs/adr/0006-section-containers.md',
      library,
    )
    expect(resolved.kind).toBe('page')
    expect(resolved.kind === 'page' && resolved.page.path).toBe('operations')
    expect(resolved.kind === 'page' && resolved.hash).toBe('')
  })

  it('keeps the anchor of a link to another page', () => {
    const resolved = resolveDocsLink('operations.md#health-checks', 'docs/sections.md', library)
    expect(resolved.kind === 'page' && resolved.hash).toBe('#health-checks')
    expect(resolved.kind === 'page' && resolved.page.path).toBe('operations')
  })

  it('finds a root file such as CONTRIBUTING.md from a doc', () => {
    const resolved = resolveDocsLink('../CONTRIBUTING.md', 'docs/operations.md', library)
    expect(resolved.kind === 'page' && resolved.page.path).toBe('contributing')
  })

  it('decodes percent-encoded paths before looking them up', () => {
    const encoded = resolveDocsLink('op%65rations.md', 'docs/sections.md', library)
    expect(encoded.kind === 'page' && encoded.page.path).toBe('operations')
  })

  it('sends a relative link to an unbundled file to GitHub in a new tab', () => {
    expect(resolveDocsLink('../README.md', 'docs/operations.md', library)).toEqual({
      kind: 'external',
      href: `${REPOSITORY_URL}/blob/main/README.md`,
      opensNewTab: true,
    })
  })

  it('sends an unbundled folder link to the GitHub tree', () => {
    expect(resolveDocsLink('../decoder/voice/', 'docs/operations.md', library)).toEqual({
      kind: 'external',
      href: `${REPOSITORY_URL}/tree/main/decoder/voice`,
      opensNewTab: true,
    })
  })

  it('keeps the anchor on a GitHub link', () => {
    const resolved = resolveDocsLink('../README.md#usage', 'docs/operations.md', library)
    expect(resolved.kind === 'external' && resolved.href).toBe(
      `${REPOSITORY_URL}/blob/main/README.md#usage`,
    )
  })

  it('opens an absolute URL externally in a new tab', () => {
    expect(resolveDocsLink('https://example.com/x', 'docs/a.md', library)).toEqual({
      kind: 'external',
      href: 'https://example.com/x',
      opensNewTab: true,
    })
  })

  it('treats a protocol-relative URL as external', () => {
    expect(resolveDocsLink('//example.com/x', 'docs/a.md', library)).toEqual({
      kind: 'external',
      href: '//example.com/x',
      opensNewTab: true,
    })
  })

  it('does not open mailto: links in a new tab', () => {
    expect(resolveDocsLink('mailto:me@example.com', 'docs/a.md', library)).toEqual({
      kind: 'external',
      href: 'mailto:me@example.com',
      opensNewTab: false,
    })
    expect(resolveDocsLink('MAILTO:me@example.com', 'docs/a.md', library)).toMatchObject({
      opensNewTab: false,
    })
  })

  it('keeps a javascript: link as an external href for the sanitiser to drop, never as a page', () => {
    const resolved = resolveDocsLink('javascript:alert(1)', 'docs/a.md', library)
    expect(resolved.kind).toBe('external')
  })
})

describe('resolveDocsImage', () => {
  const imageUrls = { 'docs/images/map.png': '/spa-assets/map-abc123.png' }

  it('returns the bundled, hashed URL for an image under docs/images', () => {
    expect(resolveDocsImage('images/map.png', 'docs/operations.md', imageUrls)).toBe(
      '/spa-assets/map-abc123.png',
    )
  })

  it('resolves from a nested document', () => {
    expect(resolveDocsImage('../images/map.png', 'docs/adr/x.md', imageUrls)).toBe(
      '/spa-assets/map-abc123.png',
    )
  })

  it('falls back to the raw GitHub file when the image was not bundled', () => {
    expect(resolveDocsImage('images/missing.png', 'docs/operations.md', imageUrls)).toBe(
      'https://raw.githubusercontent.com/barrygee/Sentinel/main/docs/images/missing.png',
    )
  })

  it('leaves absolute, protocol-relative and data URLs alone', () => {
    expect(resolveDocsImage('https://example.com/a.png', 'docs/a.md', imageUrls)).toBe(
      'https://example.com/a.png',
    )
    expect(resolveDocsImage('//example.com/a.png', 'docs/a.md', imageUrls)).toBe(
      '//example.com/a.png',
    )
    expect(resolveDocsImage('data:image/png;base64,AAAA', 'docs/a.md', imageUrls)).toBe(
      'data:image/png;base64,AAAA',
    )
  })

  it('decodes percent-encoded names', () => {
    expect(resolveDocsImage('images/ma%70.png', 'docs/operations.md', imageUrls)).toBe(
      '/spa-assets/map-abc123.png',
    )
  })
})
