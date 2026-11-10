<template>
  <div
    ref="triggerRef"
    class="base-select-menu"
    :class="{
      'base-select-menu--open': menuOpen,
      'base-select-menu--loading': loading,
    }"
    tabindex="0"
    :role="triggerRole"
    :aria-haspopup="triggerRole ? 'listbox' : undefined"
    :aria-expanded="triggerRole ? menuOpen : undefined"
    v-bind="$attrs"
    @click.stop="onTriggerClick"
    @keydown="onTriggerKeydown"
  >
    <div class="base-select-menu-selected">
      <slot name="selected" />
      <span class="base-select-menu-arrow"></span>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="menuOpen"
      ref="menuRef"
      class="base-select-menu-popup base-select-menu-popup--open"
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
 * `BaseSelectMenu` — the flat-dark custom dropdown primitive: a `tabindex`
 * trigger plus a body-teleported, fixed-position menu anchored
 * from the trigger's rect at open time. Its first users are the SDR pickers
 * (`SdrStepPicker`, `SdrSampleRatePicker`, `SdrDeviceSelector`,
 * `SdrSettingsAccordion`'s SAMPLE RATE), whose shared trigger/Teleport
 * template it was extracted from. `useTeleportedMenu` still owns the state + dismiss behaviour
 * (outside click, settle-window scroll, resize).
 *
 * The base renders the trigger shell (`base-select-menu` + `--open`/
 * `--loading`), the selected-content wrapper + arrow, and the teleported
 * menu shell (`base-select-menu-popup`); callers keep their option models and row
 * templates:
 * - `#selected` — the trigger's content, rendered before the arrow glyph
 *   (usually a `base-select-menu-text` span; callers may add icons).
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
 * Class names callers use in their slots, all styled by the unscoped block
 * below:
 * - `base-select-menu-text` (+ `--chosen` once a value is picked) for the
 *   trigger's label.
 * - `base-select-menu-option` for each row, with `--active` (keyboard
 *   highlight), `--selected` (the current value) and `--unavailable`
 *   (listed for context but not pickable); `base-select-menu-option-label`
 *   and `base-select-menu-option-detail` for a two-line row;
 *   `base-select-menu-placeholder` for an empty or "none" row.
 * Feature-specific hooks (padlocks, read-only states, per-picker menu
 * classes) stay with the caller. Contextual overrides in feature sheets
 * (e.g. `.sdr-search-adhoc-col .base-select-menu`) are higher-specificity,
 * so file load order never decides them.
 */
import { ref, watch } from 'vue'
import { useTeleportedMenu } from '@sentinel/ui/composables/useTeleportedMenu'

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
  /** Extra class(es) for the teleported menu element (a caller's own hook). */
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
const menuRef = ref<HTMLElement | null>(null)
const {
  menuOpen,
  menuStyle,
  openMenu: openTeleportedMenu,
  toggleMenu: toggleTeleportedMenu,
  closeMenu,
} = useTeleportedMenu({ menuElement: menuRef })

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

<!-- Unscoped on purpose: the option classes are rendered by callers' slots,
     outside this component's scope id, and `scoped` would raise every
     selector's specificity above the feature sheets' contextual overrides.
     Order inside the block matters: option base -> :hover/--active ->
     --unavailable -> --selected, so the later state wins a same-specificity
     tie. Feature-sheet overrides are descendant-prefixed, so their load
     order relative to this file never decides a winner. -->
<style>
.base-select-menu {
  position: relative;
  width: 100%;
  height: 34px;
  cursor: pointer;
  outline: none;
  user-select: none;
  background: rgba(var(--ink-rgb), 0.04);
  border: none;
  border-radius: 2px;
  box-sizing: border-box;
}

.base-select-menu:focus,
.base-select-menu--open {
  background: rgba(var(--ink-rgb), 0.07);
}

.base-select-menu-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 10px;
  gap: 8px;
}

.base-select-menu-text {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.25);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-select-menu-text--chosen {
  color: rgba(var(--ink-rgb), 0.75);
}

.base-select-menu-arrow {
  flex-shrink: 0;
  width: 8px;
  height: 5px;
  margin-left: 8px;
  /* Drawn as a mask rather than a fill-baked data URI: the glyph is the
     theme's ink at 20%, and a colour inside a URL cannot read a token. */
  background-color: rgba(var(--ink-rgb), 0.2);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23000'/%3E%3C/svg%3E")
    no-repeat center;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23000'/%3E%3C/svg%3E")
    no-repeat center;
  transition: transform 0.15s;
}

.base-select-menu--open .base-select-menu-arrow {
  transform: rotate(180deg);
}

.base-select-menu--loading {
  opacity: 0.45;
  pointer-events: none;
  cursor: default;
}

.base-select-menu-popup {
  display: none;
  position: fixed;
  z-index: 99999;
  background: var(--surface-raised);
  border: none;
  overflow-y: auto;
  max-height: 220px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--rule) transparent;
}

.base-select-menu-popup::-webkit-scrollbar {
  width: 8px;
}
.base-select-menu-popup::-webkit-scrollbar-track {
  background: transparent;
}
.base-select-menu-popup::-webkit-scrollbar-thumb {
  background: var(--rule);
  border-radius: 4px;
  border: 2px solid var(--surface-raised);
}
.base-select-menu-popup::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--ink-rgb), 0.32);
}

.base-select-menu-popup.base-select-menu-popup--open {
  display: block;
}

.base-select-menu-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.6);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.1s,
    color 0.1s;
}

.base-select-menu-option:hover,
.base-select-menu-option--active {
  background: rgba(var(--ink-rgb), 0.07);
  color: var(--ink-strong);
}

.base-select-menu-option-label {
  min-width: 0;
}

.base-select-menu-placeholder {
  color: rgba(var(--ink-rgb), 0.25);
}

.base-select-menu-option-detail {
  display: block;
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.05em;
  text-transform: none;
  color: var(--ink-muted);
  margin-top: 2px;
}

.base-select-menu-option:hover .base-select-menu-option-detail {
  color: var(--ink-secondary);
}

/* Unavailable row: listed for context but cannot be picked here (e.g. a radio
   reserved as another section's receiver). Dimmed with a default cursor so it does not read as clickable; the keyboard highlight is
   deliberately left intact so arrowing past it still shows where you are. */
.base-select-menu-option--unavailable {
  cursor: default;
  color: rgba(var(--ink-rgb), 0.4);
}

.base-select-menu-option--unavailable .base-select-menu-option-detail,
.base-select-menu-option--unavailable:hover .base-select-menu-option-detail {
  color: var(--accent-text);
}

/* The current value. Kept after --active so a highlighted current value stays accent. */
.base-select-menu-option--selected {
  color: var(--accent-text);
}
</style>
