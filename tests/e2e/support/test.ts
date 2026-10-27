/**
 * The full-stack specs' `test`: Playwright's, with an API `request` fixture
 * that calls the API the way the SPA's own fetches do.
 *
 * The request guard (docs/security-guard.md) answers the browser-only API with
 * 404 to a request without Fetch Metadata, so the fixture sends
 * `Sec-Fetch-Site: same-origin`. Only the API fixture: set for the whole
 * browser context (`use.extraHTTPHeaders`), Chromium refuses every request
 * that carries it (a `Sec-` header is the browser's own to send), and the
 * shell never loads. The browser sends the real header itself.
 */
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export type { APIRequestContext, Page } from '@playwright/test';

/** The header a browser sends on the SPA's own same-origin fetches. */
export const SPA_FETCH_HEADERS = { 'Sec-Fetch-Site': 'same-origin' } as const;

export const test = base.extend({
    request: async ({ playwright, baseURL }, use) => {
        const request = await playwright.request.newContext({
            ...(baseURL ? { baseURL } : {}),
            extraHTTPHeaders: SPA_FETCH_HEADERS,
        });
        await use(request);
        await request.dispose();
    },
});
