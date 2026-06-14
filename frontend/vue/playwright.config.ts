import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the live accessibility audit (axe-core in a real
 * browser). This complements the in-process `jest-axe` unit suite: a real
 * browser can evaluate layout-dependent WCAG rules that jsdom cannot — colour
 * contrast and target size (2.5.8) among them.
 *
 * Where the app is served:
 *  - Default: a `vite preview` of the committed SPA bundle (`frontend/spa-dist`),
 *    started automatically below. This is self-contained — it needs no Python
 *    backend or Docker — and is enough for the structural a11y audit (landmarks,
 *    headings, names/roles, focus, contrast, target size are all client-rendered).
 *  - Full live pass: set `A11Y_BASE_URL=http://localhost:8080` (the FastAPI app,
 *    started via Docker or uv — see the README) to audit against live map tiles
 *    and data. When set, Playwright skips its own web server and hits that URL.
 *
 * Which browser:
 *  - Default: the Playwright-bundled Chromium (`npx playwright install chromium`).
 *  - Set `PLAYWRIGHT_CHANNEL=chrome` to drive a system-installed Google Chrome
 *    instead — useful where the bundled-browser download is unavailable.
 */

const baseURL = process.env.A11Y_BASE_URL ?? 'http://localhost:4173'
const usesExternalServer = Boolean(process.env.A11Y_BASE_URL)
const channel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
  ],
  webServer: usesExternalServer
    ? undefined
    : {
        // Serve the committed SPA bundle (what production serves). Fast to start;
        // run `npm run build` first if you've changed source since the last build.
        command: 'npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
