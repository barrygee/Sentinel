/**
 * Which deployment each extracted section has in the stack under test
 * (section-containers plan P6), read from SENTINEL_E2E_SECTIONS, e.g.
 * `space:service,land:absent`. A section not listed is a `service`, as
 * `docker compose up` runs every one.
 *
 *   service     the section runs in its own container, the only place that
 *               can answer for it.
 *   absent      no container runs it (`--scale <service>=0`).
 */

export type SectionDeployment = 'service' | 'absent';

const DEPLOYMENTS: readonly SectionDeployment[] = ['service', 'absent'];

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
    return sectionDeployments.get(sectionId) ?? 'service';
}

/** True unless `sectionId` is deployed nowhere. */
export function isDeployed(sectionId: string): boolean {
    return deploymentOf(sectionId) !== 'absent';
}
