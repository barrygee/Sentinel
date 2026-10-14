import { test, expect } from '@playwright/test';
import { parseSectionDeployments } from './support/sectionDeployment';

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
