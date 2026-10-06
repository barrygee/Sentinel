import { describe, it, expect } from 'vitest'
import { createPinia } from 'pinia'
import { assertHostPinia } from './shellContext'

describe('shell/shellContext', () => {
  describe('assertHostPinia', () => {
    it('accepts a section running on the shell’s own Pinia', () => {
      const pinia = createPinia()

      expect(() => assertHostPinia({ pinia }, pinia, 'air')).not.toThrow()
    })

    it('refuses a section that sees a different Pinia (a remote that bundled its own copy)', () => {
      const hostPinia = createPinia()
      const remotePinia = createPinia()

      expect(() => assertHostPinia({ pinia: hostPinia }, remotePinia, 'sea')).toThrow(
        'Section "sea" is not using the shell\'s Pinia',
      )
    })

    it('refuses a section that sees no active Pinia at all', () => {
      expect(() => assertHostPinia({ pinia: createPinia() }, undefined, 'sdr')).toThrow(
        'Section "sdr" is not using the shell\'s Pinia',
      )
    })
  })
})
