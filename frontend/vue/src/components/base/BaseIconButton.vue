<script setup lang="ts">
import BaseButton, { type BaseButtonVariant } from './BaseButton.vue'

/**
 * `BaseIconButton` — composes `BaseButton` for the icon-plus-hover-tooltip
 * case shared by every icon-rail button in the app (`AirSideMenu.vue`,
 * `SpaceSideMenu.vue`, `MapSidebar.vue`'s tab rail, `SettingsPanel.vue`'s
 * section nav). The icon is the default slot; the `[data-tooltip]::before`
 * CSS previously copy-pasted into each of those files' own `<style>` block
 * now lives here, once.
 *
 * Tooltip positioning varies by which edge of the screen the rail sits on:
 * right-edge rails (Air/Space side-menu) open their tooltip to the *left* of
 * the button; left-edge rails (MapSidebar, Settings nav) open to the
 * *right*. `tooltipSide` names the side the tooltip itself appears on.
 *
 * The tooltip pill's own look (offset, background, text colour/font, padding,
 * height, corner radius) defaults to the shared black-pill style used by
 * every adopter above, but is overridable per instance via CSS custom
 * properties on the root element (an inline `style` binding, matching
 * `BaseButton`'s established override mechanism) for a caller whose
 * pre-existing tooltip design differs: `--ba-icon-btn-tooltip-offset`,
 * `--ba-icon-btn-tooltip-bg`, `--ba-icon-btn-tooltip-color`,
 * `--ba-icon-btn-tooltip-font`, `--ba-icon-btn-tooltip-padding`,
 * `--ba-icon-btn-tooltip-height`, `--ba-icon-btn-tooltip-radius` — e.g.
 * `SdrPanel.vue`'s left rail, whose tooltip pill predates this component and
 * has its own translucent-navy, white-text, smaller look.
 */
interface BaseIconButtonProps {
  variant?: BaseButtonVariant
  /** See `BaseButtonProps.bordered` on `BaseButton`. Rail-only. */
  bordered?: boolean
  active?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  /** Hover-tooltip text (`data-tooltip`). Omit for a button with no tooltip. */
  tooltip?: string
  /** Which side of the button the tooltip opens on. Defaults to `'right'`. */
  tooltipSide?: 'left' | 'right'
  /**
   * Accessible name — required because these buttons are icon-only (no
   * visible text). Deliberately NOT named `ariaLabel`; see the identical
   * note in `BaseToggleSwitch`.
   */
  accessibleName: string
  /**
   * Draws attention with a looping colour pulse (MapSidebar's unread-alerts
   * tab). Automatically suppressed while `active` — an already-selected tab
   * doesn't need to keep pulsing. Defaults to `false`.
   */
  pulse?: boolean
}

withDefaults(defineProps<BaseIconButtonProps>(), {
  variant: 'rail',
  bordered: false,
  active: false,
  disabled: false,
  type: 'button',
  tooltip: undefined,
  tooltipSide: 'right',
  pulse: false,
})
</script>

<template>
  <BaseButton
    class="ba-icon-btn"
    :class="{
      'ba-icon-btn--tooltip-left': tooltipSide === 'left',
      'ba-icon-btn--pulse': pulse && !active,
    }"
    :variant="variant"
    :bordered="bordered"
    :active="active"
    :disabled="disabled"
    :type="type"
    :data-tooltip="tooltip"
    :aria-label="accessibleName"
  >
    <slot />
  </BaseButton>
</template>

<style scoped>
/* Hover tooltip — a black pill offset from the button, vertically centred.
   `tooltipSide="left"` (right-edge rails) flips it to the opposite side. */
.ba-icon-btn[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + var(--ba-icon-btn-tooltip-offset, 6px));
  top: 50%;
  transform: translateY(-50%);
  background: var(--ba-icon-btn-tooltip-bg, #000);
  color: var(--ba-icon-btn-tooltip-color, var(--color-text-muted));
  font-family: var(--ba-icon-btn-tooltip-font, 'Barlow', 'Helvetica Neue', Arial, sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  padding: var(--ba-icon-btn-tooltip-padding, 0 14px);
  height: var(--ba-icon-btn-tooltip-height, 28px);
  display: flex;
  align-items: center;
  border-radius: var(--ba-icon-btn-tooltip-radius, 0);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10001;
}

.ba-icon-btn[data-tooltip]:hover::before {
  opacity: 1;
}

.ba-icon-btn--tooltip-left[data-tooltip]::before {
  left: auto;
  right: calc(100% + var(--ba-icon-btn-tooltip-offset, 6px));
}

@keyframes ba-icon-btn-pulse {
  0% {
    color: #fff;
  }
  50% {
    color: var(--color-accent);
  }
  100% {
    color: #fff;
  }
}

.ba-icon-btn--pulse {
  animation: ba-icon-btn-pulse 1.2s ease-in-out infinite;
}
</style>
