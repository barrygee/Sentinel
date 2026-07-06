import { ref, onMounted, type Ref } from 'vue'
import { useDocumentEvent } from './useDocumentEvent'
import * as settingsApi from '@/services/settingsApi'

/**
 * Dependencies a `useStagedSetting` caller supplies to bridge the composable's
 * generic "mirror now, stage the write for later" behaviour to a specific
 * Pinia store and settings namespace/key.
 */
export interface UseStagedSettingOptions<SettingValue> {
  /** Settings-API namespace the value is persisted under (e.g. `'sdr'`). */
  namespace: string
  /** Settings-API key within `namespace` (e.g. `'autoCenterWaterfallOnTune'`). */
  key: string
  /**
   * Re-hydrates the backing store from the DB (typically a store action such
   * as `sdrStore.hydrateAutoCenterFromDb()`). Resolves once the store holds
   * the freshest persisted value.
   */
  hydrateFromDb: () => Promise<void>
  /** Reads the current value out of the backing store. */
  readFromStore: () => SettingValue
  /**
   * Mirrors a new value into the backing store immediately, so the rest of
   * the app (live previews, other controls) sees the change right away. This
   * runs on every change — it is NOT the persisted write.
   */
  mirrorToStore: (value: SettingValue) => void
  /**
   * The control's `stage` emitter. Receives a deferred writer function that
   * the Settings panel invokes later, on APPLY CHANGES — this is the only
   * path that actually persists the value to the DB.
   */
  stageWrite: (stagedWriter: () => Promise<unknown> | void) => void
}

/** Public surface returned by `useStagedSetting`. */
export interface UseStagedSetting<SettingValue> {
  /** The control's local reactive value, kept in sync with the store. */
  value: Ref<SettingValue>
  /**
   * Call with the new value when the user changes the control. Updates
   * `value`, mirrors it into the store immediately, and stages the deferred
   * DB write via `stageWrite` — the write itself only happens when the
   * Settings panel later invokes that staged function (APPLY), never here.
   */
  applyChange: (newValue: SettingValue) => void
  /** Re-reads the value from the DB into the store and `value`. Exposed for tests/manual re-sync; also runs automatically on mount and on `sentinel:config-uploaded`. */
  syncFromDb: () => Promise<void>
}

/**
 * Shared behaviour for the ~9 Settings-panel controls that follow the
 * "mirror-now, stage-write-later" pattern: a local value that mirrors a
 * Pinia store field, hydrated from the DB on mount and whenever a config
 * JSON is uploaded (`sentinel:config-uploaded`), where user changes update
 * the store immediately for live preview but defer the persisted write
 * until the Settings panel's APPLY CHANGES step invokes the staged
 * function.
 *
 * Generic over the value type so it serves both boolean toggles
 * (`useStagedSetting<boolean>`) and validated numeric inputs
 * (`useStagedSetting<number>`) — callers own value validation before calling
 * `applyChange`.
 *
 * @param options - Wiring to the specific store/namespace/key this control
 *   persists, and the component's `stage` emitter.
 */
export function useStagedSetting<SettingValue>(
  options: UseStagedSettingOptions<SettingValue>,
): UseStagedSetting<SettingValue> {
  const value = ref(options.readFromStore()) as Ref<SettingValue>

  async function syncFromDb(): Promise<void> {
    await options.hydrateFromDb()
    value.value = options.readFromStore()
  }

  onMounted(() => {
    void syncFromDb()
  })

  // Keeps this control in sync when the config JSON editor uploads a new
  // config elsewhere in the app; cleaned up automatically on unmount.
  useDocumentEvent('sentinel:config-uploaded', syncFromDb)

  function applyChange(newValue: SettingValue): void {
    value.value = newValue
    options.mirrorToStore(newValue)
    options.stageWrite(() => settingsApi.put(options.namespace, options.key, newValue))
  }

  return { value, applyChange, syncFromDb }
}
