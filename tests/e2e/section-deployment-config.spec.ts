import { test, expect } from '@playwright/test';
import { parseSectionDeployments } from './support/sectionDeployment';
import { parseAppMode } from './support/appMode';

/**
 * SENTINEL_E2E_SECTIONS decides what each gateway-smoke CI leg asserts, so a
 * typo must fail loudly instead of quietly testing the wrong deployment.
 * Pure-function checks: no browser, no server.
 */

test.describe('parseSectionDeployments', () => {
    test('reads one deployment per section', () => {
        expect(parseSectionDeployments('space:service,land:absent')).toEqual(
            new Map([
                ['space', 'service'],
                ['land', 'absent'],
            ]),
        );
    });

    test('an unset or empty value lists nothing (every section a service)', () => {
        expect(parseSectionDeployments(undefined).size).toBe(0);
        expect(parseSectionDeployments('').size).toBe(0);
    });

    test('ignores blank entries and surrounding spaces', () => {
        expect(parseSectionDeployments(' space : absent , ,')).toEqual(
            new Map([['space', 'absent']]),
        );
    });

    for (const badValue of [
        'space:servce',
        'space:in-process',
        'space',
        ':service',
        'space:service:extra',
    ]) {
        test(`refuses ${JSON.stringify(badValue)}`, () => {
            expect(() => parseSectionDeployments(badValue)).toThrow(/SENTINEL_E2E_SECTIONS/);
        });
    }
});

/**
 * SENTINEL_E2E_APP_MODE picks which specs run against a leg's stack, so it
 * must fail the same way.
 */
test.describe('parseAppMode', () => {
    test('defaults to the full app when unset or blank', () => {
        expect(parseAppMode(undefined)).toBe('full');
        expect(parseAppMode('')).toBe('full');
        expect(parseAppMode('  ')).toBe('full');
    });

    for (const mode of ['full', 'sdr-manager-local-only'] as const) {
        test(`reads ${mode}`, () => {
            expect(parseAppMode(` ${mode} `)).toBe(mode);
        });
    }

    for (const badValue of ['sdr-manager-only', 'FULL', 'local-only']) {
        test(`refuses ${JSON.stringify(badValue)}`, () => {
            expect(() => parseAppMode(badValue)).toThrow(/SENTINEL_E2E_APP_MODE/);
        });
    }
});
