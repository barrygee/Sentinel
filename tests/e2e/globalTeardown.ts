import fs from 'fs';
import { TEMP_DB_PATH } from '../../playwright.fullstack.config';

/**
 * Global teardown — removes the ephemeral SQLite database file created by
 * playwright.fullstack.config.ts for this test run.
 *
 * SQLite also produces a WAL sidecar file (<db>.wal) and a shared-memory file
 * (<db>.shm) when WAL journal mode is active. All three are removed here.
 */
export default async function globalTeardown(): Promise<void> {
    for (const filePath of [TEMP_DB_PATH, `${TEMP_DB_PATH}-wal`, `${TEMP_DB_PATH}-shm`]) {
        try {
            fs.unlinkSync(filePath);
        } catch {
            // File may not exist (e.g. server never started) — ignore.
        }
    }
}
