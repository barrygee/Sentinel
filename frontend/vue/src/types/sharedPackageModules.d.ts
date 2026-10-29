// The shell's generated import of every shared-package module
// (sharedPackageModulesPlugin in @sentinel/web-config/federation).
declare module 'virtual:sentinel-shared-package-modules' {
  const sharedPackageModules: unknown[]
  export default sharedPackageModules
  /** Settles once every shared module loading so far is bound. */
  export const sharesReady: Promise<void>
}

// Every @sentinel/map-kit module, imported by the full app's boot only.
declare module 'virtual:sentinel-shared-map-kit-modules' {
  const sharedMapKitModules: unknown[]
  export default sharedMapKitModules
  /** Settles once every map-kit module is bound: App's setup calls map-kit composables. */
  export const sharesReady: Promise<void>
}
