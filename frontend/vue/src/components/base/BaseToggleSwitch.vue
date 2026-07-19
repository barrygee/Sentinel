<script setup lang="ts">
/**
 * `BaseToggleSwitch` — the bare `role="switch"` visual atom shared by every
 * Settings-panel toggle control. Purely presentational: it owns no
 * persistence, store, or hydration logic (see `BaseToggleSetting` for the
 * fully-wired setting row that adds that on top of this).
 *
 * Extracted from ~10 near-identical copy-pasted toggle controls under
 * `src/components/shared/settings/` — the markup and CSS below reproduce
 * theirs exactly (same dimensions, colors, and `is-on` class name some
 * existing tests assert on) so migrating a control to this component is a
 * pure refactor with no visual or behavioural change.
 */
interface BaseToggleSwitchProps {
  /** Current on/off state. Drive with `v-model` from the parent. */
  modelValue: boolean
  /**
   * Accessible name for the switch — required on every instance because the
   * control has no visible text of its own (the caption beside it, if any,
   * is a separate sibling element, not a `<label>`). Deliberately NOT named
   * `ariaLabel`: Vue always lets `aria-*` attributes fall through to a
   * component's root element instead of binding to a same-named prop, so a
   * prop actually named `ariaLabel` would never receive the value passed as
   * `aria-label="..."` on the component tag (see `MapLibreMap.vue` for the
   * same constraint).
   */
  accessibleName: string
  /** Disables interaction and dims the control. Defaults to `false`. */
  disabled?: boolean
}

const props = withDefaults(defineProps<BaseToggleSwitchProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  /** Fires with the next value on click; the parent owns committing it. */
  'update:modelValue': [value: boolean]
}>()

/**
 * Flips the switch, unless disabled. The native `disabled` attribute on the
 * `<button>` already prevents the browser from ever dispatching a `click`
 * here, so this guard is unreachable defense-in-depth, not exercised code —
 * kept in case this handler is ever invoked programmatically.
 */
function toggleValue(): void {
  /* v8 ignore start -- unreachable: native `disabled` blocks the click that would call this */
  if (props.disabled) return
  /* v8 ignore stop */
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    class="toggle-track"
    :class="{ 'is-on': modelValue }"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="accessibleName"
    :disabled="disabled"
    @click="toggleValue"
  >
    <span class="toggle-thumb"></span>
  </button>
</template>

<style scoped>
.toggle-track {
  position: relative;
  width: 46px;
  height: 25px;
  /* Square corners — matches the settings section's sharp-cornered controls
     (this atom only renders inside the settings panel). */
  border-radius: 0;
  border: none;
  background: rgba(16, 19, 29, 0.14);
  cursor: pointer;
  padding: 0;
  transition: background 0.18s;
}
.toggle-track:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.toggle-track.is-on {
  background: #c8ff00;
}
.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 19px;
  height: 19px;
  border-radius: 0;
  background: #ffffff;
  transition:
    left 0.18s,
    background 0.18s;
}
.toggle-track.is-on .toggle-thumb {
  background: #0a0c10;
  left: 24px;
}
</style>
