<template>
  <div
    ref="triggerRef"
    class="sdr-device-dropdown"
    :class="{
      'sdr-device-dropdown--open': menuOpen,
      'sdr-device-dropdown--loading': loading,
    }"
    tabindex="0"
    :role="triggerRole"
    :aria-haspopup="triggerRole ? 'listbox' : undefined"
    :aria-expanded="triggerRole ? menuOpen : undefined"
    v-bind="$attrs"
    @click.stop="onTriggerClick"
    @keydown="onTriggerKeydown"
  >
    <div class="sdr-device-dropdown-selected">
      <slot name="selected" />
      <span class="sdr-device-dropdown-arrow"></span>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="menuOpen"
      class="sdr-device-menu sdr-device-menu--open"
      :class="menuClass"
      :style="menuStyle"
      v-bind="menuAttrs"
      @click.stop
    >
      <slot name="options" :close="closeMenu" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * `BaseSelectMenu` — the flat-dark custom dropdown primitive underlying the
 * SDR pickers (`SdrStepPicker`, `SdrSampleRatePicker`, `SdrDeviceSelector`,
 * `SdrSettingsAccordion`'s SAMPLE RATE, `SdrTrunkSection`'s channel map):
 * a `tabindex` trigger plus a body-teleported, fixed-position menu anchored
 * from the trigger's rect at open time. Extracted from (not a rewrite of)
 * the trigger/Teleport template those pickers each carried on top of
 * `useTeleportedMenu`, which still owns the state + dismiss behaviour
 * (outside click, settle-window scroll, resize).
 *
 * The base renders the trigger shell (`sdr-device-dropdown` + `--open`/
 * `--loading`), the selected-content wrapper + arrow, and the teleported
 * menu shell (`sdr-device-menu`); callers keep their option models and row
 * templates:
 * - `#selected` — the trigger's content, rendered before the arrow glyph
 *   (text span, connection dot, padlock, …).
 * - `#options` — the menu rows; receives `{ close }` so a row click can
 *   dismiss the menu.
 *
 * Fallthrough attributes land on the trigger element (`class`, `aria-label`,
 * `aria-controls`, `aria-owns`, `aria-activedescendant`, …). The default
 * keyboard model matches the simple pickers — Enter/Space toggles (gated by
 * `disabled` after `preventDefault`), Escape closes; callers with a
 * different model (fully-gated triggers, listbox arrow navigation) opt out
 * via `customKeyboard` and drive the exposed `menuOpen`/`openMenu`/
 * `toggleMenu`/`closeMenu` from their own `@trigger-keydown` handler.
 *
 * Styling stays in `SdrPanel.css` for now: the `sdr-device-*` family's
 * per-picker modifiers (`.sdr-step-menu`, `.sdr-trunk-menu`, …) are
 * equal-specificity overrides that depend on cascade order, so the family
 * moves here in one piece in the B10 co-location sweep rather than risking
 * a split cascade.
 */
import { ref, watch } from 'vue'
import { useTeleportedMenu } from '@/composables/useTeleportedMenu'

// Multi-root (trigger + Teleport): attrs are bound explicitly on the trigger.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /** Renders the trigger's loading/disabled style (`--loading`). Purely visual — gating is `disabled`. */
  loading?: boolean
  /**
   * Ignores trigger clicks and the default keyboard toggle (Escape still
   * closes, matching the pre-extraction pickers). Deliberately does NOT gate
   * the exposed `openMenu`/`toggleMenu`/`closeMenu` — callers with quirkier
   * gates (e.g. `SdrStepPicker`'s deliberately ungated keyboard) own them
   * via `customKeyboard`.
   */
  disabled?: boolean
  /**
   * Popup-trigger ARIA (`role`, `aria-haspopup="listbox"`, live
   * `aria-expanded`). Omit to render a bare styled div (the step and
   * settings sample-rate pickers predate the ARIA and stay byte-identical).
   */
  triggerRole?: 'button' | 'combobox'
  /**
   * Replaces the default trigger keydown handling with a `trigger-keydown`
   * emit so the caller can implement its own keyboard model against the
   * exposed menu controls.
   */
  customKeyboard?: boolean
  /** Extra class(es) for the teleported menu element (e.g. `sdr-step-menu`). */
  menuClass?: string
  /** Extra attributes for the teleported menu element (e.g. `role="listbox"` + its label). */
  menuAttrs?: Record<string, string>
}>()

const emit = defineEmits<{
  /** The menu opened (any path: click, keyboard, exposed calls). */
  (event: 'open'): void
  /** The menu closed (any path, including outside click/scroll/resize dismissal). */
  (event: 'close'): void
  /** `customKeyboard` only: a keydown reached the trigger. */
  (event: 'trigger-keydown', keyboardEvent: KeyboardEvent): void
}>()

const triggerRef = ref<HTMLElement | null>(null)
const {
  menuOpen,
  menuStyle,
  openMenu: openTeleportedMenu,
  toggleMenu: toggleTeleportedMenu,
  closeMenu,
} = useTeleportedMenu()

// Watching the ref (rather than wrapping open/close) catches every state
// change, including the composable's own dismissals (outside click, scroll,
// resize), so callers tracking open state never go stale.
watch(menuOpen, (isNowOpen) => {
  if (isNowOpen) {
    emit('open')
  } else {
    emit('close')
  }
})

/** Position from the trigger rect and open the menu. */
function openMenu() {
  openTeleportedMenu(triggerRef.value)
}

/** Close the menu when open, otherwise open it. */
function toggleMenu() {
  toggleTeleportedMenu(triggerRef.value)
}

function onTriggerClick() {
  if (props.disabled) return
  toggleMenu()
}

function onTriggerKeydown(keyboardEvent: KeyboardEvent) {
  if (props.customKeyboard) {
    emit('trigger-keydown', keyboardEvent)
    return
  }
  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
    keyboardEvent.preventDefault()
    if (!props.disabled) toggleMenu()
  }
  if (keyboardEvent.key === 'Escape') closeMenu()
}

defineExpose({
  /** Whether the menu is currently open (reactive). */
  menuOpen,
  openMenu,
  toggleMenu,
  closeMenu,
})
</script>
