/**
 * Which deployment each extracted section has in the stack under test
 * (section-containers plan P6), read from SENTINEL_E2E_SECTIONS, e.g.
 * `space:service,land:absent`. A section not listed is `in-process` — how
 * `npm run test:e2e:fullstack` boots the monolith.
 *
 *   in-process  the app hosts the section itself.
 *   service     the section runs in its own container and the app does not
 *               host it (SENTINEL_EXTERNAL_SERVICES), so only the container
 *               can answer for it.
 *   absent      the app does not host it and no container runs it.
 */

export type SectionDeployment = 'in-process' | 'service' | 'absent';

const DEPLOYMENTS: readonly SectionDeployment[] = ['in-process', 'service', 'absent'];

/** Parses SENTINEL_E2E_SECTIONS; throws on a typo so a CI leg can't silently test the wrong thing. */
export function parseSectionDeployments(value: string | undefined): Map<string, SectionDeployment> {
    const deployments = new Map<string, SectionDeployment>();
    for (const entry of (value ?? '').split(',')) {
        const trimmedEntry = entry.trim();
        if (!trimmedEntry) continue;
        const parts = trimmedEntry.split(':').map((part) => part.trim());
        const [sectionId, deployment] = parts;
        if (
            parts.length !== 2 ||
            !sectionId ||
            !DEPLOYMENTS.includes(deployment as SectionDeployment)
        ) {
            throw new Error(`SENTINEL_E2E_SECTIONS: bad entry ${JSON.stringify(trimmedEntry)}`);
        }
        deployments.set(sectionId, deployment as SectionDeployment);
    }
    return deployments;
}

const sectionDeployments = parseSectionDeployments(process.env.SENTINEL_E2E_SECTIONS);

/** How `sectionId` is deployed in the stack under test. */
export function deploymentOf(sectionId: string): SectionDeployment {
    return sectionDeployments.get(sectionId) ?? 'in-process';
}

/** True unless `sectionId` is deployed nowhere. */
export function isDeployed(sectionId: string): boolean {
    return deploymentOf(sectionId) !== 'absent';
}
