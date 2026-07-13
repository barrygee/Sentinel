<template>
  <BasePillToggle
    class="ba-icon-action"
    :class="tooltip ? `ba-icon-action--tip-${tooltipSide}` : undefined"
    :active="active"
    :active-class="activeClass"
    :data-tooltip="tooltip"
    :aria-label="accessibleName"
  >
    <slot />
  </BasePillToggle>
</template>

<script setup lang="ts">
/**
 * `BaseIconAction` — the small icon-only row-action button (track/notify/
 * auto-tune/record accessories, edit/delete/play row actions, clear-✕ and
 * dismiss buttons). Composes `BasePillToggle` (the same button + optional
 * caller-named active class contract) and adds what icon actions need on
 * top: a required accessible name (the button has no visible text) and an
 * optional hover tooltip.
 *
 * This is the NON-RAIL sibling of `BaseIconButton`: rail buttons compose
 * `BaseButton`'s rail chrome and open their tooltip to the left/right of a
 * screen-edge rail, while these sit inside list rows/headers, keep their
 * own per-family button chrome (in the feature sheets until the B10
 * co-location sweep — including the button's `position`, which callers own:
 * some families are `position: absolute` in their layout), and anchor their
 * tooltip vertically:
 * - `tooltipSide="top"` (default) — above the button, left-aligned to it
 *   (the Air/Space accessory rows).
 * - `tooltipSide="bottom"` — below the button, right-aligned (the recordings
 *   row actions, which sit at the top of each row).
 * - `tooltipSide="left"` — to the left, vertically centred (the decode
 *   dock's clear buttons, which sit at a pane's right edge).
 *
 * The tooltip pill defaults to the shared black-pill look (matching the
 * accessory rows and `BaseIconButton`'s default); the flat-navy families
 * override it via CSS custom properties on the button (set in their family
 * CSS): `--ba-icon-action-tooltip-offset`, `-bg`, `-color`, `-font`,
 * `-padding`, `-height`, `-radius`, `-z`.
 */
import BasePillToggle from './BasePillToggle.vue'

withDefaults(
  defineProps<{
    /**
     * Accessible name (`aria-label`) — required because these buttons are
     * icon-only. Deliberately NOT named `ariaLabel`; see the identical note
     * in `BaseToggleSwitch`.
     */
    accessibleName: string
    /** Hover-tooltip text (`data-tooltip`). Omit for a button with no tooltip. */
    tooltip?: string
    /** Where the tooltip opens relative to the button (see the component doc). */
    tooltipSide?: 'top' | 'bottom' | 'left'
    /** Whether the action is in its selected/on state (see `BasePillToggle`). */
    active?: boolean
    /** The caller's CSS family class for the active state (see `BasePillToggle`). */
    activeClass?: string
  }>(),
  {
    tooltip: undefined,
    tooltipSide: 'top',
    active: false,
    activeClass: undefined,
  },
)
</script>

<style scoped>
/* Hover tooltip — defaults to the black pill shared by the Air/Space
   accessory rows (and BaseIconButton); the flat-navy families override via
   the custom properties. The button's own `position` stays with the caller's
   family CSS (see the component doc) — every adopter already positions its
   buttons, and some are position:absolute in their layout. */
.ba-icon-action[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  background: var(--ba-icon-action-tooltip-bg, #000);
  color: var(--ba-icon-action-tooltip-color, var(--color-text-muted));
  font-family: var(--ba-icon-action-tooltip-font, 'Barlow', 'Helvetica Neue', Arial, sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  padding: var(--ba-icon-action-tooltip-padding, 0 14px);
  height: var(--ba-icon-action-tooltip-height, 28px);
  display: flex;
  align-items: center;
  border-radius: var(--ba-icon-action-tooltip-radius, 0);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: var(--ba-icon-action-tooltip-z, 10002);
}

.ba-icon-action[data-tooltip]:hover::before {
  opacity: 1;
}

/* Above the button, left-aligned to its edge so the label reads as belonging
   to the hovered button rather than floating centred. */
.ba-icon-action--tip-top[data-tooltip]::before {
  bottom: calc(100% + var(--ba-icon-action-tooltip-offset, 6px));
  left: 0;
}

/* Below the button, right-aligned (row actions at the top of a row). */
.ba-icon-action--tip-bottom[data-tooltip]::before {
  top: calc(100% + var(--ba-icon-action-tooltip-offset, 6px));
  right: 0;
}

/* To the left, vertically centred (buttons at a pane's right edge). */
.ba-icon-action--tip-left[data-tooltip]::before {
  right: calc(100% + var(--ba-icon-action-tooltip-offset, 6px));
  top: 50%;
  transform: translateY(-50%);
}
</style>
