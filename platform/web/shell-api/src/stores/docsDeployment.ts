import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Body of core's `GET /api/app/docs`. */
interface DocsDeploymentResponse {
  deployed?: unknown
  available?: unknown
}

/**
 * Whether this deployment includes the in-app docs.
 *
 * The docs are their own optional service (compose service `docs`), so the
 * shell asks core at boot (`GET /api/app/docs`) whether one is registered, and
 * offers Docs — the Settings rail entry, each setting's LEARN MORE link — only
 * when it is. Offered until boot has asked, so a shell that never asks (the
 * Vite dev harness, component specs) behaves as it always has.
 */
export const useDocsDeploymentStore = defineStore('docsDeployment', () => {
  /** True when a docs service is registered with core. */
  const deployed = ref(true)

  /**
   * Ask core whether the docs service is deployed. Never throws: core not
   * answering means no Docs, the same as a deployment without the service.
   */
  async function load(): Promise<void> {
    try {
      const response = await fetch('/api/app/docs')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = (await response.json()) as DocsDeploymentResponse
      deployed.value = body.deployed === true
    } catch {
      deployed.value = false
    }
  }

  return { deployed, load }
})
