// The shell's generated import of every shared-package module
// (sharedPackageModulesPlugin in @sentinel/web-config/federation).
declare module 'virtual:sentinel-shared-package-modules' {
  const sharedPackageModules: unknown[]
  export default sharedPackageModules
}

// Every @sentinel/map-kit module, imported by the full app's boot only.
declare module 'virtual:sentinel-shared-map-kit-modules' {
  const sharedMapKitModules: unknown[]
  export default sharedMapKitModules
}
