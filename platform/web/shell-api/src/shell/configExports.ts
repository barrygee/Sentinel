/**
 * Extra files for Settings › App Settings › Export All Configuration.
 *
 * Export All always writes core's own files (the settings and the SDR data
 * files). A configuration kept by another service — this machine's SDR
 * Manager config, held by sdr-manager-local — is registered here by that
 * service's remote, so Export All includes it exactly when that service is
 * deployed, without the shell importing the remote.
 */

/** One extra file Export All writes. */
export interface ConfigExport {
  /** The file name written, e.g. `sdr-manager-local-config.json`. */
  filename: string
  /**
   * Reads the configuration to write (serialised as indented JSON). Rejects
   * with an `Error` whose message says, in a few words, why the file can't be
   * exported now (e.g. "sign in to this machine’s SDR Manager first"): Export
   * All then skips the file and shows that reason instead of failing the rest.
   */
  read: () => Promise<unknown>
}

const configExports: ConfigExport[] = []

/** Registers an extra file. File names must be unique. */
export function registerConfigExport(entry: ConfigExport): void {
  if (configExports.some((existing) => existing.filename === entry.filename)) {
    throw new Error(`Config export "${entry.filename}" is already registered`)
  }
  configExports.push(entry)
}

/** Every registered extra file, in registration order. */
export function getConfigExports(): readonly ConfigExport[] {
  return [...configExports]
}

/** Empties the registry, so each spec starts with no extra files. */
export function resetConfigExportsForTests(): void {
  configExports.length = 0
}
