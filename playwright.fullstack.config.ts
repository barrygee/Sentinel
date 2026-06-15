import { defineConfig, devices } from '@playwright/test';
import os from 'os';
import path from 'path';

/**
 * Playwright config for the full-stack integration smoke suite.
 *
 * Unlike the mocked UI suite in frontend/vue/e2e/ (PR #97), this suite boots
 * the REAL FastAPI backend against an ephemeral, isolated SQLite database file
 * and drives a real Playwright browser against the running stack. The goal is
 * to prove that the frontend and backend actually integrate — not to achieve
 * breadth (that is the UI suite's job).
 *
 * DB isolation:
 *   A temporary SQLite file is created under the OS temp directory for each
 *   test run. The `DB_PATH` environment variable is forwarded to uvicorn so
 *   pydantic-settings picks it up as `Settings.db_path`. This is the only
 *   supported seam: no source files are modified. The file is removed after the
 *   run by the `globalTeardown` script.
 *
 * Browser:
 *   No bundled Chromium is downloaded in this project — instead we reuse
 *   system-installed Google Chrome via `PLAYWRIGHT_CHANNEL=chrome` (same
 *   approach as frontend/vue/playwright.config.ts). Set this env var to "chrome"
 *   to use system Chrome, or install a bundled browser with:
 *     npx playwright install chromium
 *
 * To run locally:
 *   PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:fullstack
 *
 *   Or without the env var if chromium is already installed:
 *   npm run test:e2e:fullstack
 */

const TEST_PORT = 8099;

/** Absolute path to the temporary SQLite DB for this run, stored in OS temp. */
export const TEMP_DB_PATH = path.join(os.tmpdir(), `sentinel-e2e-smoke-${Date.now()}.db`);

const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false, // sequential: tests share the one real server
    forbidOnly: Boolean(process.env.CI),
    retries: 0, // smoke suite must be deterministic — no flake budget
    workers: 1, // single worker: shared DB state; tests run sequentially
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/playwright-report' }]],
    timeout: 30_000,
    use: {
        baseURL: `http://localhost:${TEST_PORT}`,
        trace: 'on-first-retry',
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
    globalTeardown: './tests/e2e/globalTeardown.ts',
    webServer: {
        /**
         * Start the real FastAPI backend on the test port.
         *
         * Key env vars forwarded to the server process:
         *   DB_PATH — points uvicorn at the isolated temp SQLite file so the test
         *             run never touches the developer's real backend/sentinel.db.
         *
         * `reuseExistingServer: false` forces a fresh server on every run so
         * CI always starts from a clean state.
         */
        command: `DB_PATH=${TEMP_DB_PATH} uv run --project backend uvicorn backend.main:app --port ${TEST_PORT} --log-level warning`,
        url: `http://localhost:${TEST_PORT}/health`,
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            DB_PATH: TEMP_DB_PATH,
        },
    },
});
