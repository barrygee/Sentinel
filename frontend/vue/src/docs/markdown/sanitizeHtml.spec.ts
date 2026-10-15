import { describe, it, expect } from 'vitest'
import { sanitizeDocsHtml } from './sanitizeHtml'

describe('sanitizeDocsHtml', () => {
  it('keeps ordinary prose markup', () => {
    const html =
      '<p>Hello <strong>bold</strong> <em>em</em> <code>code</code></p><ul><li>one</li></ul>'
    expect(sanitizeDocsHtml(html)).toBe(html)
  })

  it('removes script elements and their contents', () => {
    const cleaned = sanitizeDocsHtml('<p>safe</p><script>window.hacked = 1</script>')
    expect(cleaned).toBe('<p>safe</p>')
    expect(cleaned).not.toContain('script')
    expect(cleaned).not.toContain('hacked')
  })

  it('removes inline event handler attributes but keeps the element', () => {
    const cleaned = sanitizeDocsHtml(
      '<img src="a.png" alt="x" onerror="alert(1)"><p onclick="alert(2)">hi</p>',
    )
    expect(cleaned).not.toContain('onerror')
    expect(cleaned).not.toContain('onclick')
    expect(cleaned).toContain('<img')
    expect(cleaned).toContain('hi')
  })

  it('removes javascript: URLs from links', () => {
    const cleaned = sanitizeDocsHtml('<a href="javascript:alert(1)">click</a>')
    expect(cleaned).not.toContain('javascript:')
    expect(cleaned).toContain('click')
  })

  it('removes javascript: URLs hidden by case, whitespace or entities', () => {
    for (const href of [
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java&#x73;cript:alert(1)',
    ]) {
      expect(sanitizeDocsHtml(`<a href="${href}">x</a>`)).not.toMatch(/javascript/i)
    }
  })

  it('removes iframes and objects', () => {
    const cleaned = sanitizeDocsHtml(
      '<iframe src="https://example.com"></iframe><object data="x"></object><p>ok</p>',
    )
    expect(cleaned).not.toMatch(/iframe|object/)
    expect(cleaned).toContain('<p>ok</p>')
  })

  it('removes style elements and svg script payloads', () => {
    const cleaned = sanitizeDocsHtml(
      '<style>body{display:none}</style><svg><script>alert(1)</script></svg>',
    )
    expect(cleaned).not.toContain('<style')
    expect(cleaned).not.toContain('script')
  })

  it('keeps target on a link so external links can open in a new tab', () => {
    const cleaned = sanitizeDocsHtml(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    )
    expect(cleaned).toContain('target="_blank"')
    expect(cleaned).toContain('rel="noopener noreferrer"')
    expect(cleaned).toContain('href="https://example.com"')
  })

  it('keeps in-app link markers (data attributes)', () => {
    expect(sanitizeDocsHtml('<a href="/doc/x" data-doc-link="">x</a>')).toContain('data-doc-link')
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizeDocsHtml('')).toBe('')
  })
})
