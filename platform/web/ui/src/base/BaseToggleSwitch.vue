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
 * pure refactor with no visual or behavioural change. `size="compact"`
 * likewise reproduces the SDR panel's smaller switch.
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
  /**
   * `default` is the square 46×25 Settings switch. `compact` is the 36×18
   * rounded, outlined switch that sits beside a panel-density input (the SDR
   * frequency form's AUTO (AGC)), with a round thumb and a tinted accent fill.
   */
  size?: 'default' | 'compact'
}

const props = withDefaults(defineProps<BaseToggleSwitchProps>(), {
  disabled: false,
  size: 'default',
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
    :class="{ 'is-on': modelValue, 'toggle-track--compact': size === 'compact' }"
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
  background: rgba(var(--ink-rgb), 0.14);
  cursor: pointer;
  padding: 0;
  transition: background 0.18s;
}
.toggle-track:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.toggle-track.is-on {
  background: var(--accent);
}
.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 19px;
  height: 19px;
  border-radius: 0;
  background: var(--knob-ink);
  transition:
    left 0.18s,
    background 0.18s;
}
.toggle-track.is-on .toggle-thumb {
  background: var(--accent-ink);
  left: 24px;
}

/* Compact: a pill track with a hairline border and a round thumb, tinted
   rather than filled when on, to sit quietly beside a 36px panel input. */
.toggle-track--compact {
  width: 36px;
  height: 18px;
  border-radius: 9px;
  border: 1px solid rgba(var(--ink-rgb), 0.2);
  background: rgba(var(--ink-rgb), 0.04);
  transition:
    background 0.15s,
    border-color 0.15s;
}
.toggle-track--compact.is-on {
  background: rgba(var(--accent-rgb), 0.2);
  border-color: rgba(var(--accent-rgb), 0.6);
}
.toggle-track--compact .toggle-thumb {
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(var(--ink-rgb), 0.55);
  transition:
    left 0.15s,
    background 0.15s;
}
.toggle-track--compact.is-on .toggle-thumb {
  background: var(--accent);
  left: 20px;
}
</style>
