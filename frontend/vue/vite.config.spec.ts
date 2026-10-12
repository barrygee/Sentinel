import { describe, it, expect } from 'vitest'
import type { UserConfig } from 'vite'
import viteConfig from './vite.config'

/**
 * The shell's Vite config decides where `/api` and `/ws` go in each server.
 *
 * `vite preview` serves the Playwright e2e suite. Vite gives it the dev
 * server's proxy unless the config sets its own (`preview.proxy ?? server.proxy`),
 * and the dev proxy points at :8080 — the live stack on a dev machine — so an
 * unmocked call from a spec, a DELETE included, would reach real data.
 */
function resolveConfig(command: 'serve' | 'build'): UserConfig {
  return viteConfig({ command, mode: 'test', isSsrBuild: false, isPreview: false }) as UserConfig
}

describe('vite.config', () => {
  it.each(['serve', 'build'] as const)(
    'gives the preview (e2e) server its own empty proxy when run for %s',
    (command) => {
      const config = resolveConfig(command)

      // Present, so Vite does not fall back to the dev proxy, and empty.
      expect(config.preview?.proxy).toBeDefined()
      expect(config.preview?.proxy).toEqual({})
    },
  )

  it('keeps the dev server forwarding the API and sockets to the backend on :8080', () => {
    const proxy = resolveConfig('serve').server?.proxy as Record<string, { target: string }>

    expect(proxy['/api']?.target).toBe('http://localhost:8080')
    expect(proxy['/ws']?.target).toBe('ws://localhost:8080')
  })
})
