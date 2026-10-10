import { test, expect, type Page } from '@playwright/test';

/**
 * Section deployment suite — a section works the same whether core hosts it
 * in-process, it runs in its own container, or it is not deployed at all
 * (section-containers plan P6: "e2e green with the section present *and*
 * absent"). Space is the first section extracted (P6.1).
 *
 * SENTINEL_E2E_SPACE says which deployment the stack under test is:
 *   in-process (default)  the monolith hosts Space, as `npm run test:e2e:fullstack` boots it.
 *   service               Space runs in its own container and the app does NOT host it
 *                         (SENTINEL_EXTERNAL_SERVICES=space), so only the container can answer.
 *   absent                the app does not host Space and no container runs it.
 * The gateway-smoke CI job runs this spec once per deployment.
 *
 * Test inventory:
 *   1. /api/app/sections lists Space exactly when it is deployed.
 *   2. Space's API answers with JSON when deployed (from the container in `service` mode).
 *   3. Space's remote entry is served, uncached, when deployed.
 *   4. The shell offers Space in the nav and opens its view when deployed.
 *   5. Absent: no Space link, /space/ falls back to the first section, every other section still loads.
 */

type SpaceDeployment = 'in-process' | 'service' | 'absent';

const deployment = (process.env.SENTINEL_E2E_SPACE ?? 'in-process') as SpaceDeployment;
const spaceIsDeployed = deployment !== 'absent';

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

test(`/api/app/sections lists Space only when it is deployed (${deployment})`, async ({
    request,
}) => {
    const response = await request.get('/api/app/sections');
    expect(response.status()).toBe(200);
    const { sections } = (await response.json()) as { sections: DeployedSection[] };
    const space = sections.find((section) => section.id === 'space');

    if (spaceIsDeployed) {
        expect(space).toEqual({
            id: 'space',
            remoteEntry: '/remotes/space/remoteEntry.js',
            available: true,
        });
    } else {
        expect(space).toBeUndefined();
    }
    // Space's presence never changes the other sections.
    expect(sections.map((section) => section.id)).toEqual(
        expect.arrayContaining(['air', 'sea', 'land', 'sdr']),
    );
});

test(`Space's API answers with JSON when deployed (${deployment})`, async ({ request }) => {
    test.skip(!spaceIsDeployed, 'Space is not deployed');

    // The day/night terminator is computed locally: no upstream, so this is
    // deterministic. In `service` mode the app has no Space routes at all, so
    // a JSON answer here can only have come from the Space container.
    const response = await request.get('/api/space/daynight');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual(expect.any(Object));
});

test(`Space's remote entry is served uncached when deployed (${deployment})`, async ({
    request,
}) => {
    test.skip(!spaceIsDeployed, 'Space is not deployed');

    const response = await request.get('/remotes/space/remoteEntry.js');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('javascript');
    expect(response.headers()['cache-control']).toContain('no-cache');
});

test(`the shell offers Space and opens its view when deployed (${deployment})`, async ({
    page,
}) => {
    test.skip(!spaceIsDeployed, 'Space is not deployed');

    await page.goto('/space/');
    await waitForShellHydration(page);

    const domainNav = page.getByRole('navigation', { name: /domains/i });
    await expect(domainNav.getByRole('link', { name: /space/i })).toHaveAttribute(
        'aria-current',
        'page',
        { timeout: 10_000 },
    );
    // The remote really loaded: not the stand-in a failed remote gets.
    await expect(
        page.getByRole('heading', { level: 1, name: /space is unavailable/i }),
    ).toHaveCount(0);
});

test('an absent Space leaves no trace and the other sections keep working', async ({
    page,
    request,
}) => {
    test.skip(spaceIsDeployed, 'Space is deployed');

    // Not even a stale copy of its remote: the app withholds the build of a
    // section it doesn't host.
    expect((await request.get('/remotes/space/remoteEntry.js')).status()).toBe(404);

    await page.goto('/space/');
    await waitForShellHydration(page);

    // An unknown section route falls back to the first section.
    await expect(page).toHaveURL(/\/air\/$/);
    const domainNav = page.getByRole('navigation', { name: /domains/i });
    await expect(domainNav.getByRole('link', { name: /space/i })).toHaveCount(0);
    // The sections enabled by default (Land ships disabled, default_config.json).
    for (const section of ['air', 'sea', 'sdr']) {
        await expect(
            domainNav.getByRole('link', { name: new RegExp(section, 'i') }),
        ).toBeAttached();
    }
    await expect(page.getByRole('heading', { level: 1, name: /is unavailable/i })).toHaveCount(0);
});
