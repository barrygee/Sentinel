import { test, expect, type Page } from '@playwright/test';
import { isDeployed } from './support/sectionDeployment';
import { isSdrManagerLocalOnly } from './support/appMode';

/**
 * SDR Manager deployment suite (ADR 0007, SDR Manager plan PR 10) — what the
 * browser gets in each app mode, run by every gateway-smoke leg:
 *
 * SDR Manager-only mode (`local-only-mock`):
 *   1. `/`, and any map-app URL, lands on Settings › SDR Manager.
 *   2. The page is SDR Manager and App Settings only, Settings pinned as the page.
 *   3. It downloads no MapLibre, no map module and no tiles.
 *
 * The full app:
 *   4. Settings › SDR Manager has REMOTE SDR HOSTS exactly when sdr-manager-remote
 *      runs, and THIS MACHINE's own group when sdr-manager-local runs (else
 *      sdr-manager-remote's notice saying how to start it).
 *   5. It still downloads MapLibre and draws a map.
 */

/** Requests only a map makes: the MapLibre library, the map component, tiles and sprites. */
const MAP_REQUEST =
    /loadShare__maplibre_mf_2_gl|\/MapLibreMap-[^/]+\.js$|\/api\/offline-map\/(basemap|terrain)\/|\/assets\/sprites?\//;

function recordMapRequests(page: Page): string[] {
    const mapRequests: string[] = [];
    page.on('request', (request) => {
        if (MAP_REQUEST.test(request.url())) mapRequests.push(request.url());
    });
    return mapRequests;
}

/**
 * The Settings panel's group headings, plus sdr-manager-remote's THIS MACHINE
 * notice heading — not the headings inside cards that reuse the class (IMPORT).
 */
async function groupLabels(page: Page): Promise<string[]> {
    const headings = page.locator(
        '#settings-panel div.settings-group-label, #sdr-manager-local-not-enabled-heading',
    );
    return (await headings.allTextContents()).map((label) => label.trim());
}

test.describe('SDR Manager-only mode', () => {
    test.skip(!isSdrManagerLocalOnly, 'the stack runs the full app');

    for (const path of ['/', '/air/', '/settings/air']) {
        test(`${path} lands on Settings › SDR Manager`, async ({ page }) => {
            await page.goto(path);

            await expect(page).toHaveURL(/\/settings\/sdr-manager$/);
            await expect(page.locator('#settings-panel')).toBeVisible();
        });
    }

    test('is SDR Manager and App Settings only, with Settings as the page', async ({ page }) => {
        await page.goto('/');

        const panel = page.locator('#settings-panel');
        await expect(panel).toHaveAttribute('role', 'region');
        await expect(page.locator('header#nav')).toContainText('SDR MANAGER ONLY');
        await expect(page.locator('#settings-panel .settings-nav-item')).toHaveCount(2);
        await expect(page.getByRole('button', { name: 'SDR Manager', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'App Settings', exact: true })).toBeVisible();
        await expect.poll(() => groupLabels(page)).toContain('THIS MACHINE');
        expect(await groupLabels(page)).not.toContain('REMOTE SDR HOSTS');
        // Nothing of the map app: no section nav, no footer, no map.
        await expect(page.locator('nav#nav-right')).toHaveCount(0);
        await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(0);
    });

    test('downloads no MapLibre, no map module and no tiles, even on App Settings', async ({
        page,
    }) => {
        const mapRequests = recordMapRequests(page);
        await page.goto('/');
        await expect.poll(() => groupLabels(page)).toContain('THIS MACHINE');

        // App Settings is where the map's own settings would be, were they offered.
        await page.getByRole('button', { name: 'App Settings', exact: true }).click();
        await expect(page).toHaveURL(/\/settings\/app$/);
        await page.waitForLoadState('networkidle');

        expect(mapRequests).toEqual([]);
    });
});

test.describe('the full app', () => {
    test.skip(isSdrManagerLocalOnly, 'the stack runs SDR Manager-only mode');

    test('Settings › SDR Manager has a group for each SDR Manager service the stack runs', async ({
        page,
    }) => {
        test.skip(
            !isDeployed('sdr-manager-local') && !isDeployed('sdr-manager-remote'),
            'no SDR Manager service, so no SDR Manager settings',
        );
        await page.goto('/settings/sdr-manager');

        const remoteGroups = isDeployed('sdr-manager-remote') ? ['REMOTE SDR HOSTS'] : [];
        // Either sdr-manager-local's own THIS MACHINE group, or (it not running)
        // sdr-manager-remote's notice under the same heading saying how to start it.
        const thisMachine = isDeployed('sdr-manager-local') || isDeployed('sdr-manager-remote');
        await expect
            .poll(async () => (await groupLabels(page)).sort())
            .toEqual([...remoteGroups, ...(thisMachine ? ['THIS MACHINE'] : [])].sort());
        await expect(page.locator('#sdr-manager-local-not-enabled-heading')).toHaveCount(
            isDeployed('sdr-manager-local') ? 0 : 1,
        );
    });

    test('still downloads MapLibre and draws a map', async ({ page }) => {
        const mapRequests = recordMapRequests(page);
        // A section whose map shows on open; the SDR section's (the only one
        // some legs deploy) sits behind its spectrum, so there it is only built.
        const mapSection = ['air', 'space', 'sea'].find((sectionId) => isDeployed(sectionId));
        await page.goto(mapSection ? `/${mapSection}/` : '/');

        const canvas = page.locator('canvas.maplibregl-canvas').first();
        if (mapSection) await expect(canvas).toBeVisible({ timeout: 30_000 });
        else await expect(canvas).toBeAttached({ timeout: 30_000 });
        expect(mapRequests.some((url) => /loadShare__maplibre_mf_2_gl/.test(url))).toBe(true);
        expect(mapRequests.some((url) => /\/MapLibreMap-[^/]+\.js$/.test(url))).toBe(true);
    });
});
