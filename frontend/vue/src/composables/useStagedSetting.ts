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
  /**
   * When true, `mirrorToStore` is *also* deferred until the staged writer
   * runs on APPLY, instead of running immediately in `applyChange`. A small
   * number of controls (e.g. those gating a tab or a whole UI section's
   * visibility) rely on the store NOT changing until the user actually
   * applies, so no gated UI flashes into view and then reverts if they
   * navigate away without applying. Defaults to `false` (mirror
   * immediately), which is the behaviour of most staged settings.
   */
  deferMirror?: boolean
  /**
   * Overrides how the persisted write is built. By default `applyChange`
   * stages a plain `settingsApi.put(namespace, key, newValue)`. Supply this
   * when the control's actual persisted write is a combined payload read
   * from live store state at APPLY time rather than the bare new value —
   * e.g. the overhead-alert radius, which persists nested inside a shared
   * `overheadAlerts` object alongside sibling toggle values it doesn't own.
   */
  buildStagedWriter?: (newValue: SettingValue) => () => Promise<unknown> | void
  /**
   * When false, skips wiring the `sentinel:config-uploaded` re-sync listener
   * — only the mount-time hydrate runs. Defaults to `true`. A small number of
   * pre-existing controls never listened for that event before migrating
   * onto this composable; set this to `false` for those so consolidating
   * them onto shared plumbing doesn't silently add new re-sync behaviour.
   */
  syncOnConfigUpload?: boolean
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
  // config elsewhere in the app; cleaned up automatically on unmount. Opt-out
  // via `syncOnConfigUpload: false` for controls that never had this before.
  if (options.syncOnConfigUpload !== false) {
    useDocumentEvent('sentinel:config-uploaded', syncFromDb)
  }

  function buildStagedWriter(newValue: SettingValue): () => Promise<unknown> | void {
    return (
      options.buildStagedWriter?.(newValue) ??
      (() => settingsApi.put(options.namespace, options.key, newValue))
    )
  }

  function applyChange(newValue: SettingValue): void {
    value.value = newValue
    if (options.deferMirror) {
      // Both the store mirror and the DB write wait for APPLY CHANGES.
      options.stageWrite(() => {
        options.mirrorToStore(newValue)
        return buildStagedWriter(newValue)()
      })
    } else {
      options.mirrorToStore(newValue)
      options.stageWrite(buildStagedWriter(newValue))
    }
  }

  return { value, applyChange, syncFromDb }
}
