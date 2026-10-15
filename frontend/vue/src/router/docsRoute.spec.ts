import { describe, it, expect, beforeEach } from 'vitest'
import { DOCS_ROUTE_NAME, docsParamOf, docsReturn, isDocsRoute } from './docsRoute'

describe('router/docsRoute', () => {
  beforeEach(() => {
    docsReturn.reset()
  })

  describe('isDocsRoute', () => {
    it('names the docs route', () => {
      expect(DOCS_ROUTE_NAME).toBe('doc')
    })

    it('recognises the docs route by name only', () => {
      expect(isDocsRoute({ name: 'doc' })).toBe(true)
      expect(isDocsRoute({ name: 'settings' })).toBe(false)
      expect(isDocsRoute({ name: undefined })).toBe(false)
      expect(isDocsRoute({ name: 'document' })).toBe(false)
    })
  })

  describe('docsParamOf', () => {
    it('reads the page path', () => {
      expect(docsParamOf({ params: { docPath: 'operations' } })).toBe('operations')
      expect(docsParamOf({ params: { docPath: 'adr/0006-x' } })).toBe('adr/0006-x')
    })

    it('is empty when there is no path, so the caller shows the welcome page', () => {
      expect(docsParamOf({ params: {} })).toBe('')
    })

    it('is empty for a repeated parameter rather than guessing one', () => {
      expect(docsParamOf({ params: { docPath: ['a', 'b'] } })).toBe('')
    })
  })

  describe('docsReturn', () => {
    it('starts with nowhere to return to and no opener', () => {
      expect(docsReturn.path).toBeNull()
      expect(docsReturn.opener).toBeNull()
    })

    it('forgets both on reset', () => {
      docsReturn.path = '/air/'
      docsReturn.opener = document.createElement('button')
      docsReturn.reset()
      expect(docsReturn.path).toBeNull()
      expect(docsReturn.opener).toBeNull()
    })
  })
})
