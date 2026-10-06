import { test, expect } from '@playwright/test';

/**
 * Gateway smoke suite — what the Caddy gateway in front of the composed stack
 * must guarantee (section-containers plan §4.4, §4.5). Runs only against a
 * running stack (`npm run test:e2e:gateway`, see playwright.fullstack.config.ts);
 * the rest of the fullstack suite runs through the gateway alongside it, which
 * is the "same UX through Caddy" half of the P5 exit.
 *
 * Test inventory:
 *   1. /internal/ is never routed — registration is unreachable from a browser.
 *   2. The shell document carries the script CSP, with no 'unsafe-inline'.
 *   3. The shell and its section remotes load with no CSP violation.
 *   4. The alerts SSE stream is flushed, not buffered by the proxy.
 *   5. /ws/sdr/* WebSockets upgrade through the gateway.
 */

test('the gateway never routes /internal/, whatever the method or spelling', async ({
    request,
}) => {
    // Behind uvicorn alone a GET here falls through to the SPA catch-all (200);
    // only the gateway's own block turns every one of these into a JSON 404.
    for (const path of [
        '/internal/registry/register',
        '/internal',
        '/INTERNAL/registry/register',
        '/%69nternal/registry/register',
    ]) {
        for (const response of [await request.get(path), await request.post(path, { data: {} })]) {
            expect(response.status(), `${path}`).toBe(404);
            expect(await response.json()).toEqual({ detail: 'Not Found' });
        }
    }
});

test('the shell document is served with a script CSP that allows no inline injection', async ({
    request,
}) => {
    const response = await request.get('/air/');
    expect(response.status()).toBe(200);
    const policy = response.headers()['content-security-policy'] ?? '';
    const scriptSrc = policy
        .split(';')
        .find((directive) => directive.trim().startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'self'");
    // The boot scripts are allowed by hash, never by 'unsafe-inline'.
    expect(scriptSrc).toMatch(/'sha256-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
});

test('the shell and every section remote load through the gateway with no CSP violation', async ({
    page,
}) => {
    const violations: string[] = [];
    page.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });
    await page.goto('/air/');
    const domainsNav = page.getByRole('navigation', { name: /domains/i });
    await expect(domainsNav).toBeVisible({ timeout: 15_000 });
    // The inline boot script ran (it sets the map palette before first paint).
    await expect(page.locator('html')).toHaveAttribute('data-map-theme', /dark|light/);

    // Visit each enabled section so its remote's code actually executes.
    const sectionLinks = await domainsNav.getByRole('link').all();
    expect(sectionLinks.length).toBeGreaterThan(0);
    for (const link of sectionLinks) {
        await link.click();
        await expect(link).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('main#main')).toBeAttached();
    }
    expect(violations).toEqual([]);
});

test('the alerts SSE stream reaches the browser unbuffered', async ({ page }) => {
    await page.goto('/air/');
    // Read the first chunk only: a proxy that buffered the stream would hold it
    // until the server closes the connection, which it never does.
    const firstChunk = await page.evaluate(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5_000);
        try {
            const response = await fetch('/api/air/messages/stream', { signal: controller.signal });
            const reader = response.body!.getReader();
            const { value } = await reader.read();
            controller.abort();
            return {
                contentType: response.headers.get('content-type'),
                text: new TextDecoder().decode(value),
            };
        } finally {
            clearTimeout(timer);
        }
    });
    expect(firstChunk.contentType).toContain('text/event-stream');
    expect(firstChunk.text).toContain('retry:');
});

test('the SDR WebSocket upgrades through the gateway', async ({ page }) => {
    await page.goto('/air/');
    // No radio 999 exists; the hub may close straight after, but the upgrade
    // itself proves the gateway proxies WebSockets to it.
    // The root tsconfig has no DOM lib, so the page's host is passed in.
    const opened = await page.evaluate(
        (host) =>
            new Promise<boolean>((resolve) => {
                const socket = new WebSocket(`ws://${host}/ws/sdr/999`);
                socket.onopen = () => {
                    socket.close();
                    resolve(true);
                };
                socket.onerror = () => resolve(false);
                setTimeout(() => resolve(false), 5_000);
            }),
        new URL(page.url()).host,
    );
    expect(opened).toBe(true);
});
