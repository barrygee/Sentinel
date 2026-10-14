<script setup lang="ts">
import { ref, computed, watch, useId } from 'vue'
import { useStagedSetting } from '@sentinel/shell-api/settings/useStagedSetting'

/**
 * `BaseTextSetting` — a Settings-panel single-line text input wired to the
 * "mirror-now, stage-write-later" lifecycle via `useStagedSetting`, the text
 * counterpart of `BaseNumberSetting`.
 *
 * `validate` returns a message for a value that must not be saved; the input
 * is then marked invalid, the message is shown under it (and announced, and
 * named as the input's description), and nothing is staged until the text is
 * valid again — so APPLY CHANGES never persists a value the backend would
 * refuse.
 */
interface BaseTextSettingProps {
  /** Accessible name for the input — the setting's caption is a separate sibling. */
  accessibleName: string
  /** Hint shown in the empty input (e.g. what an empty value means). */
  placeholder?: string
  /** Native `maxlength` on the input. */
  maxLength?: number
  /** Returns why `text` can't be saved, or `null` when it can. Defaults to accepting anything. */
  validate?: (text: string) => string | null
  /** Settings-API namespace this value is persisted under (e.g. `'sdr'`). */
  namespace: string
  /** Settings-API key within `namespace` (e.g. `'recordingsFolder'`). */
  settingKey: string
  /** Re-hydrates the backing store from the DB; see `useStagedSetting`. */
  hydrateFromDb: () => Promise<void>
  /** Reads the current value out of the backing store. */
  readFromStore: () => string
  /** Mirrors a new value into the backing store. */
  mirrorToStore: (value: string) => void
  /** Disables the input. Defaults to `false`. */
  disabled?: boolean
}

const props = withDefaults(defineProps<BaseTextSettingProps>(), {
  placeholder: '',
  maxLength: undefined,
  validate: () => null,
  disabled: false,
})

const emit = defineEmits<{
  /** Re-emitted from `useStagedSetting` for the Settings panel to collect. */
  stage: [fn: () => Promise<unknown> | void]
  /** Fired on Enter — the Settings panel treats this as "commit and close". */
  commit: []
}>()

const { value, applyChange } = useStagedSetting<string>({
  namespace: props.namespace,
  key: props.settingKey,
  hydrateFromDb: props.hydrateFromDb,
  readFromStore: props.readFromStore,
  mirrorToStore: props.mirrorToStore,
  stageWrite: (stagedWriter) => emit('stage', stagedWriter),
})

/** The text the user is editing — distinct from `value`, the committed setting. */
const inputText = ref<string>(value.value)
const errorMessage = computed(() => props.validate(inputText.value))
const errorId = `text-setting-error-${useId()}`

// A DB hydrate or config-file re-sync replaces the text, unless the user is
// mid-edit on that very value.
watch(value, (newValue) => {
  if (inputText.value !== newValue) inputText.value = newValue
})

function onInput(): void {
  if (errorMessage.value !== null) return
  applyChange(inputText.value)
}
</script>

<template>
  <div class="text-setting-wrap">
    <input
      v-model="inputText"
      type="text"
      class="text-setting-input"
      :class="{ 'text-setting-input--invalid': errorMessage !== null }"
      :placeholder="placeholder"
      :maxlength="maxLength"
      :aria-label="accessibleName"
      :aria-invalid="errorMessage !== null"
      :aria-describedby="errorMessage !== null ? errorId : undefined"
      :disabled="disabled"
      spellcheck="false"
      autocomplete="off"
      @input="onInput"
      @keydown.enter="emit('commit')"
    />
    <p :id="errorId" class="text-setting-error" role="alert">{{ errorMessage ?? '' }}</p>
  </div>
</template>

<style scoped>
.text-setting-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  width: 100%;
  max-width: 240px;
}
.text-setting-input {
  width: 100%;
  min-height: 28px;
  padding: 0;
  /* The settings panel's field treatment: no fill, a hairline rule under the
     value that thickens to the accent on focus — as BaseNumberSetting. */
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: inset 0 -1px 0 var(--settings-field-line, var(--rule));
  color: var(--ink);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-value);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-align: right;
  outline: none;
  transition: box-shadow 0.15s;
}
.text-setting-input::placeholder {
  color: rgba(var(--ink-rgb), 0.5);
}
.text-setting-input:focus {
  box-shadow: inset 0 -2px 0 var(--color-accent);
}
.text-setting-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.text-setting-input--invalid {
  box-shadow: inset 0 -2px 0 var(--danger);
}
.text-setting-error {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  color: var(--danger);
  text-align: right;
}
.text-setting-error:empty {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .text-setting-input {
    transition: none;
  }
}
</style>
