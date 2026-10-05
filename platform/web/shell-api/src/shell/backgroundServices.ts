/**
 * Background services (docs/plans/section-containers.md §3.6, F7).
 *
 * Some section work must run whichever section is on screen — aircraft and
 * overhead alerts, satellite pass alerts. Each section registers its service
 * here and the shell starts them all once at boot, so `App.vue` no longer
 * imports section internals to do it. (In the federated shell these become
 * each remote's `./background` entry.)
 */
export interface BackgroundService {
  /** Stable id, e.g. 'air-alerts'. */
  id: string
  /** Starts the service. Must be idempotent: the shell may call it once per boot. */
  start(): void
}

const services: BackgroundService[] = []

/** Registers a service. Each id once — a duplicate is a programming error. */
export function registerBackgroundService(service: BackgroundService): void {
  if (services.some((existing) => existing.id === service.id)) {
    throw new Error(`Background service "${service.id}" is already registered`)
  }
  services.push(service)
}

/** Starts every registered service, in registration order. */
export function startBackgroundServices(): void {
  for (const service of services) service.start()
}

/** Test seam: forget every registered service. */
export function resetBackgroundServicesForTests(): void {
  services.length = 0
}
