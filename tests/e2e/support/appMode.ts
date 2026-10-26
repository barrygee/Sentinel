/**
 * The app mode of the stack under test, read from SENTINEL_E2E_APP_MODE
 * (`full`, the default, or `sdr-manager-local-only` — the gateway-smoke CI
 * leg that runs compose.sdr-manager-local-only.yaml). Specs that drive the
 * map app skip themselves in SDR Manager-only mode, which has none.
 */

export type AppModeUnderTest = 'full' | 'sdr-manager-local-only';

const APP_MODES: readonly AppModeUnderTest[] = ['full', 'sdr-manager-local-only'];

/** Parses SENTINEL_E2E_APP_MODE; throws on a typo so a CI leg can't silently test the wrong thing. */
export function parseAppMode(value: string | undefined): AppModeUnderTest {
    const mode = (value ?? '').trim() || 'full';
    if (!APP_MODES.includes(mode as AppModeUnderTest)) {
        throw new Error(`SENTINEL_E2E_APP_MODE: unknown mode ${JSON.stringify(mode)}`);
    }
    return mode as AppModeUnderTest;
}

/** The mode of the stack under test. */
export const appModeUnderTest: AppModeUnderTest = parseAppMode(process.env.SENTINEL_E2E_APP_MODE);

/** True when the stack under test is SDR Manager-only mode (no map, no sections). */
export const isSdrManagerLocalOnly = appModeUnderTest === 'sdr-manager-local-only';
