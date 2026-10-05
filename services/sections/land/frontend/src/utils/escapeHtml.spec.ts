import { describe, it, expect } from 'vitest'
import { escapeHtml } from './escapeHtml'

describe('escapeHtml', () => {
  it('leaves a string with no HTML-significant characters untouched', () => {
    expect(escapeHtml('GB3NR Norwich 2M')).toBe('GB3NR Norwich 2M')
  })

  it('returns an empty string unchanged', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('escapes each of the five HTML-significant characters', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('a<b<c')).toBe('a&lt;b&lt;c')
    expect(escapeHtml('"x" & "y"')).toBe('&quot;x&quot; &amp; &quot;y&quot;')
  })

  it('escapes ampersands first so an entity is not double-decoded by the browser', () => {
    // If `<` were replaced before `&`, the output would read `&amp;lt;` and the
    // browser would render the literal text "&lt;" instead of "<".
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('neutralises an injected script tag so it cannot be parsed as markup', () => {
    const escaped = escapeHtml('<script>alert(1)</script>')
    expect(escaped).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    const host = document.createElement('div')
    host.innerHTML = escaped
    expect(host.querySelector('script')).toBeNull()
    expect(host.textContent).toBe('<script>alert(1)</script>')
  })

  it('neutralises an attribute-breaking payload', () => {
    const escaped = escapeHtml('" onerror="alert(1)')
    expect(escaped).toBe('&quot; onerror=&quot;alert(1)')
    const host = document.createElement('div')
    host.innerHTML = `<span title="${escaped}">x</span>`
    expect(host.querySelector('span')?.getAttribute('onerror')).toBeNull()
    expect(host.querySelector('span')?.getAttribute('title')).toBe('" onerror="alert(1)')
  })
})
