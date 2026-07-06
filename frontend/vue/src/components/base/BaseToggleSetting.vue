<script setup lang="ts">
import BaseToggleSwitch from './BaseToggleSwitch.vue'
import { useStagedSetting } from '@/composables/useStagedSetting'

/**
 * `BaseToggleSetting` — a full Settings-panel toggle row: a short uppercase
 * caption plus a `BaseToggleSwitch`, wired to the "mirror-now, stage-write-
 * later" lifecycle via `useStagedSetting`. Every migrated pure toggle control
 * (`SdrAutoCenterControl`, `AirReplayToggleControl`, etc.) is a thin wrapper
 * that supplies its store bindings as props here instead of re-implementing
 * the switch markup, DB hydration, and staged-write plumbing.
 *
 * The surrounding Settings-panel row (`SettingRow.vue`) already renders the
 * setting's full label/description text; `label` here is the short caption
 * that sits immediately beside the switch, matching each control's existing
 * on-screen text exactly.
 */
interface BaseToggleSettingProps {
  /** Short uppercase caption rendered beside the switch. */
  label: string
  /**
   * Accessible name for the switch itself. Deliberately NOT named `ariaLabel`
   * — see the identical note in `BaseToggleSwitch`.
   */
  accessibleName: string
  /** Settings-API namespace this value is persisted under (e.g. `'sdr'`). */
  namespace: string
  /** Settings-API key within `namespace` (e.g. `'autoCenterWaterfallOnTune'`). */
  settingKey: string
  /** Re-hydrates the backing store from the DB; see `useStagedSetting`. */
  hydrateFromDb: () => Promise<void>
  /** Reads the current value out of the backing store. */
  readFromStore: () => boolean
  /** Mirrors a new value into the backing store. */
  mirrorToStore: (value: boolean) => void
  /**
   * When true, defers `mirrorToStore` until the staged writer runs on APPLY
   * instead of calling it immediately. Used by controls that gate other UI
   * (e.g. showing/hiding a tab) so that gated UI doesn't flash into view
   * before the user has actually applied the change. Defaults to `false`
   * (mirror immediately — the behaviour of most toggles).
   */
  deferMirror?: boolean
  /** Disables the switch. Defaults to `false`. */
  disabled?: boolean
}

const props = withDefaults(defineProps<BaseToggleSettingProps>(), {
  deferMirror: false,
  disabled: false,
})

const emit = defineEmits<{
  /** Re-emitted from `useStagedSetting` for the Settings panel to collect. */
  stage: [fn: () => Promise<unknown> | void]
}>()

const { value, applyChange } = useStagedSetting<boolean>({
  namespace: props.namespace,
  key: props.settingKey,
  hydrateFromDb: props.hydrateFromDb,
  readFromStore: props.readFromStore,
  mirrorToStore: props.mirrorToStore,
  deferMirror: props.deferMirror,
  stageWrite: (stagedWriter) => emit('stage', stagedWriter),
})
</script>

<template>
  <div class="toggle-setting-wrap">
    <div class="toggle-setting-row">
      <span class="toggle-setting-label">{{ label }}</span>
      <BaseToggleSwitch
        :model-value="value"
        :accessible-name="accessibleName"
        :disabled="disabled"
        @update:model-value="applyChange"
      />
    </div>
  </div>
</template>

<style scoped>
.toggle-setting-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.toggle-setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toggle-setting-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.6);
}
</style>
