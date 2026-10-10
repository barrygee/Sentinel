import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { deploymentOf, isDeployed } from './support/sectionDeployment';

/**
 * Section deployment suite — each extracted section works the same whether
 * core hosts it in-process, it runs in its own container, or it is not
 * deployed at all (section-containers plan P6: "e2e green with the section
 * present *and* absent"). SENTINEL_E2E_SECTIONS says which deployment each
 * section has (see support/sectionDeployment.ts); the gateway-smoke CI job
 * runs this spec once per deployment.
 *
 * Test inventory, per extracted section:
 *   1. /api/app/sections lists it exactly when it is deployed.
 *   2. Its API answers with JSON when deployed (from the container in `service` mode).
 *   3. Its remote entry is served, uncached, when deployed — and is a 404 when absent.
 *   4. The shell offers it in the nav and opens its view when deployed.
 *   5. Absent: no nav link, its route falls back to the first section, the rest still loads.
 */

interface ExtractedSection {
    id: string;
    label: RegExp;
    /** A deterministic, read-only endpoint of the section (no upstream, no internet). */
    probePath: string;
    /** Land ships disabled (default_config.json); the nav only shows enabled sections. */
    enabledByDefault: boolean;
}

const EXTRACTED_SECTIONS: readonly ExtractedSection[] = [
    { id: 'space', label: /space/i, probePath: '/api/space/daynight', enabledByDefault: true },
    {
        id: 'land',
        label: /land/i,
        probePath: '/api/land/aprs/stations',
        enabledByDefault: false,
    },
];

/** Sections every deployment keeps, enabled by default — what must survive an absent one. */
const ALWAYS_PRESENT = ['air', 'sea', 'sdr'];

interface DeployedSection {
    id: string;
    remoteEntry: string;
    available: boolean;
}

/** Waits until the Vue shell is fully mounted and the router has settled. */
async function waitForShellHydration(page: Page): Promise<void> {
    await expect(page.getByRole('navigation', { name: /domains/i })).toBeVisible({
        timeout: 15_000,
    });
    await expect(page.locator('main#main')).toBeAttached();
}

/** Turns a section on for the duration of `body`, restoring its stored value after. */
async function withSectionEnabled(
    request: APIRequestContext,
    sectionId: string,
    body: () => Promise<void>,
): Promise<void> {
    const before = (await (await request.get(`/api/settings/${sectionId}`)).json()) as {
        enabled?: boolean;
    };
    await request.put(`/api/settings/${sectionId}/enabled`, { data: { value: true } });
    try {
        await body();
    } finally {
        await request.put(`/api/settings/${sectionId}/enabled`, {
            data: { value: before.enabled ?? false },
        });
    }
}

for (const section of EXTRACTED_SECTIONS) {
    const deployment = deploymentOf(section.id);
    const deployed = isDeployed(section.id);

    test.describe(`${section.id} (${deployment})`, () => {
        test('/api/app/sections lists it only when it is deployed', async ({ request }) => {
            const response = await request.get('/api/app/sections');
            expect(response.status()).toBe(200);
            const { sections } = (await response.json()) as { sections: DeployedSection[] };
            const listed = sections.find((listedSection) => listedSection.id === section.id);

            if (deployed) {
                expect(listed).toEqual({
                    id: section.id,
                    remoteEntry: `/remotes/${section.id}/remoteEntry.js`,
                    available: true,
                });
            } else {
                expect(listed).toBeUndefined();
            }
            expect(sections.map((listedSection) => listedSection.id)).toEqual(
                expect.arrayContaining(ALWAYS_PRESENT),
            );
        });

        test('its API answers with JSON when deployed', async ({ request }) => {
            test.skip(!deployed, `${section.id} is not deployed`);

            // In `service` mode the app has no routes for this section at all,
            // so a JSON answer can only have come from its container.
            const response = await request.get(section.probePath);
            expect(response.status()).toBe(200);
            expect(response.headers()['content-type']).toContain('application/json');
            expect(await response.json()).toEqual(expect.any(Object));
        });

        test('its remote entry is served uncached when deployed, and withheld when not', async ({
            request,
        }) => {
            const response = await request.get(`/remotes/${section.id}/remoteEntry.js`);

            if (!deployed) {
                // Not even a stale copy: the app withholds the build of a section it doesn't host.
                expect(response.status()).toBe(404);
                return;
            }
            expect(response.status()).toBe(200);
            expect(response.headers()['content-type']).toContain('javascript');
            expect(response.headers()['cache-control']).toContain('no-cache');
        });

        test('the shell offers it and opens its view when deployed', async ({ page, request }) => {
            test.skip(!deployed, `${section.id} is not deployed`);

            const openSection = async () => {
                await page.goto(`/${section.id}/`);
                await waitForShellHydration(page);

                const domainNav = page.getByRole('navigation', { name: /domains/i });
                await expect(domainNav.getByRole('link', { name: section.label })).toHaveAttribute(
                    'aria-current',
                    'page',
                    { timeout: 10_000 },
                );
                // The remote really loaded: not the stand-in a failed remote gets.
                await expect(
                    page.getByRole('heading', { level: 1, name: /is unavailable/i }),
                ).toHaveCount(0);
            };

            if (section.enabledByDefault) {
                await openSection();
            } else {
                await withSectionEnabled(request, section.id, openSection);
            }
        });

        test('when absent it leaves no trace and the other sections keep working', async ({
            page,
            request,
        }) => {
            test.skip(deployed, `${section.id} is deployed`);

            // Even switched on in settings, an absent section has nothing to show.
            await withSectionEnabled(request, section.id, async () => {
                await page.goto(`/${section.id}/`);
                await waitForShellHydration(page);

                // An unknown section route falls back to the first section.
                await expect(page).toHaveURL(/\/air\/$/);
                const domainNav = page.getByRole('navigation', { name: /domains/i });
                await expect(domainNav.getByRole('link', { name: section.label })).toHaveCount(0);
                for (const presentSection of ALWAYS_PRESENT) {
                    await expect(
                        domainNav.getByRole('link', { name: new RegExp(presentSection, 'i') }),
                    ).toBeAttached();
                }
                await expect(
                    page.getByRole('heading', { level: 1, name: /is unavailable/i }),
                ).toHaveCount(0);
            });
        });
    });
}
