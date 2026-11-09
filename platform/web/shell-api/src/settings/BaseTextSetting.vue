<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
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
  /** Settings-API key within `namespace` (e.g. `'onlineUrl'`). */
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
  <BaseTextField
    v-model="inputText"
    density="settings"
    class="text-setting-wrap"
    :aria-label="accessibleName"
    :error="errorMessage ?? ''"
    error-alert
    :placeholder="placeholder"
    :maxlength="maxLength"
    :disabled="disabled"
    spellcheck="false"
    autocomplete="off"
    @input="onInput"
    @keydown.enter="emit('commit')"
  />
</template>

<style scoped>
/* Free text (a folder path, a name) reads left to right, so it is
   left-aligned rather than centred like a number, and the field is wide
   enough for a typical path without running across the whole card. */
.text-setting-wrap {
  width: 100%;
  max-width: 360px;
}
</style>
