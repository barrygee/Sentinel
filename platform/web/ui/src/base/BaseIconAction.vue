<template>
  <BasePillToggle
    ref="pillToggleRef"
    class="ba-icon-action"
    :class="[
      tooltip ? `ba-icon-action--tip-${tooltipSide}` : undefined,
      {
        'ba-icon-action--row': variant === 'row',
        'ba-icon-action--danger': danger,
        'ba-icon-action--active': active,
      },
    ]"
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
 *
 * `variant="row"` is the one look this component owns itself: the muted glyph
 * at the end of a Settings list row (edit pencil, remove cross, dismiss) that
 * the SDR radios, SDR Manager hosts and devices, notices and offline-map areas
 * share across four packages. It brightens on hover, turns accent while
 * `active` (an open editor) and, with `danger`, red on hover. The other
 * families keep their chrome in their own sheets, as above.
 *
 * The button is always `ba-icon-action--active` while `active`, alongside the
 * caller's `activeClass`, so callers that only need the row look can omit
 * `activeClass`.
 */
import { ref } from 'vue'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'

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
    /**
     * `default` leaves the chrome to the caller's family CSS; `row` is the
     * muted Settings row-action glyph this component styles itself.
     */
    variant?: 'default' | 'row'
    /** A destructive action (remove, forget, delete): the `row` glyph turns red on hover. */
    danger?: boolean
  }>(),
  {
    tooltip: undefined,
    tooltipSide: 'top',
    active: false,
    activeClass: undefined,
    variant: 'default',
    danger: false,
  },
)

const pillToggleRef = ref<InstanceType<typeof BasePillToggle> | null>(null)

/**
 * Moves focus to the button: callers that hand focus back after an inline
 * confirm closes (the offline-map area delete) hold a ref to this component,
 * not to the element.
 */
function focus(): void {
  ;(pillToggleRef.value?.$el as HTMLButtonElement | undefined)?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
/* The Settings row-action glyph (variant="row"): a 13px icon with 5px either
   side, so a row's buttons line up with `.sdr-device-btn-slot` spacers. */
.ba-icon-action--row {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 4px 5px;
  cursor: pointer;
  color: rgba(var(--ink-rgb), 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s;
}

/* Before :hover, which ties with it on specificity: hovering an open editor's
   pencil brightens it like any other, as it always has. */
.ba-icon-action--row.ba-icon-action--active {
  color: var(--accent-text);
}

.ba-icon-action--row:hover {
  color: rgba(var(--ink-rgb), 0.85);
}

.ba-icon-action--row.ba-icon-action--danger:hover {
  color: var(--danger);
}

/* Hover tooltip — defaults to the black pill shared by the Air/Space
   accessory rows (and BaseIconButton); the flat-navy families override via
   the custom properties. The button's own `position` stays with the caller's
   family CSS (see the component doc) — every adopter already positions its
   buttons, and some are position:absolute in their layout. */
.ba-icon-action[data-tooltip]::before {
  content: attr(data-tooltip);
  position: absolute;
  background: var(--ba-icon-action-tooltip-bg, var(--tooltip-bg));
  color: var(--ba-icon-action-tooltip-color, var(--tooltip-ink));
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
