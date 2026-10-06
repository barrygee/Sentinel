import { computed } from 'vue'
import { getCapability } from '@sentinel/shell-api/shell/capabilities'
import type { RadioCapability } from '@sentinel/shell-api/shell/radioCapability'

/**
 * The `radio` capability for a component, with a reactive `connected` and an
 * `available` flag. While no section provides a radio, `connected` is false,
 * so callers' existing "connect an SDR" notices cover the absent-section case
 * too.
 */
export function useRadio() {
  const radio = computed<RadioCapability | undefined>(() => getCapability('radio'))
  return {
    radio,
    available: computed(() => radio.value !== undefined),
    connected: computed(() => radio.value?.connected ?? false),
  }
}
