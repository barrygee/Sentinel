import { useLandStore, type AprsLabelFieldMap } from '@/stores/land'
import type { AllSettings } from '@sentinel/shell-api/shell/settingsHydration'

/**
 * Land's boot hydration (moved out of `main.ts`, F1): the APRS station label
 * fields. Same cross-device rationale as Air's label fields — adopt the stored
 * choice, or seed the DB from this browser's current one when the key has
 * never been written.
 */
export function hydrateLandFromSettings(settings: AllSettings): void {
  const landStore = useLandStore()
  const remoteAprsFields = settings.land?.labelDataPoints as Partial<AprsLabelFieldMap> | undefined
  if (
    remoteAprsFields &&
    typeof remoteAprsFields === 'object' &&
    !Array.isArray(remoteAprsFields)
  ) {
    landStore.setAprsLabelFields({ ...landStore.aprsLabelFields, ...remoteAprsFields })
  } else {
    fetch('/api/settings/land/labelDataPoints', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: landStore.aprsLabelFields }),
    }).catch(() => {})
  }
}
