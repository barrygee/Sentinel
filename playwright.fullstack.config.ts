import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the full-stack integration smoke suite.
 *
 * Unlike the mocked UI suite in frontend/vue/e2e/, this suite drives a real,
 * running Sentinel stack — the gateway, core, NATS and the section services —
 * with a real browser. The goal is to prove the frontend and the services
 * actually integrate, not breadth (that is the UI suite's job).
 *
 * The stack is the composed one: no server is started here. Bring one up,
 * then point the suite at its gateway (SENTINEL_E2E_BASE_URL, default
 * http://localhost:8080):
 *
 *   docker compose up -d --wait
 *   PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:gateway
 *
 * The suite writes to that stack's databases (it creates and deletes a radio,
 * toggles settings and restores them), so point it at a throwaway stack.
 *
 * Browser:
 *   No bundled Chromium is downloaded in this project — instead we reuse
 *   system-installed Google Chrome via `PLAYWRIGHT_CHANNEL=chrome` (same
 *   approach as frontend/vue/playwright.config.ts). Set this env var to "chrome"
 *   to use system Chrome, or install a bundled browser with:
 *     npx playwright install chromium
 */

const channel = process.env.PLAYWRIGHT_CHANNEL;

/** The gateway of the running stack under test. */
const baseURL = process.env.SENTINEL_E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false, // sequential: tests share the one real stack
    forbidOnly: Boolean(process.env.CI),
    retries: 0, // smoke suite must be deterministic — no flake budget
    workers: 1, // single worker: shared DB state; tests run sequentially
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/playwright-report' }]],
    timeout: 30_000,
    use: {
        baseURL,
        trace: 'on-first-retry',
        // No extraHTTPHeaders here: they would reach the browser too, which
        // refuses a request carrying Sec-Fetch-Site. The API fixture sends it
        // instead (tests/e2e/support/test.ts).
    },
    projects: [
        {
            name: 'chromium-fullstack',
            use: {
                ...devices['Desktop Chrome'],
                ...(channel ? { channel } : {}),
            },
        },
    ],
});
