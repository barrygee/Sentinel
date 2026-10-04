import { shallowReactive } from 'vue'
import type { RadioCapability } from './radioCapability'
import type { RadioSitesCapability } from './radioSitesCapability'

/**
 * Shell capability registry (docs/plans/section-containers.md §3.6).
 *
 * A capability is a typed service one section offers the others — `radio`
 * and `radioSites`, both provided by the sdr section today. It replaces reaching into another
 * section's store or firing an untyped document `CustomEvent` at whichever
 * component happens to listen: the caller asks the shell for the capability
 * by name and gets `undefined` when no section provides it, so it can degrade
 * (e.g. hide its tune buttons) when the provider's section is absent.
 *
 * Lookups are reactive: a computed/template that reads `getCapability(...)`
 * re-evaluates when a provider arrives or withdraws.
 */
export interface CapabilityMap {
  radio: RadioCapability
  radioSites: RadioSitesCapability
}

export type CapabilityName = keyof CapabilityMap

const providers = shallowReactive(new Map<CapabilityName, CapabilityMap[CapabilityName]>())

/**
 * Offers a capability. Returns a function that withdraws it again. A second
 * provider for the same name is a programming error (two sections claiming to
 * own the radio), so it throws rather than silently replacing the first.
 */
export function provideCapability<Name extends CapabilityName>(
  name: Name,
  implementation: CapabilityMap[Name],
): () => void {
  if (providers.has(name)) {
    throw new Error(`Capability "${name}" is already provided`)
  }
  providers.set(name, implementation)
  return () => {
    if (providers.get(name) === implementation) providers.delete(name)
  }
}

/** The provider of `name`, or `undefined` when no registered section offers it. Reactive. */
export function getCapability<Name extends CapabilityName>(
  name: Name,
): CapabilityMap[Name] | undefined {
  return providers.get(name) as CapabilityMap[Name] | undefined
}
