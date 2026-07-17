<script setup lang="ts">
/**
 * The four button looks that actually recur across the app today (evidence
 * in the doc comment below `BaseButtonProps`). Each is a real, ≥2-site
 * pattern — not a speculative addition.
 */
export type BaseButtonVariant = 'rail' | 'ghost' | 'primary' | 'danger'

/**
 * `BaseButton` — the generic button atom underlying every icon-rail, ghost,
 * primary, and danger button in the app. Extracted from (not a rewrite of)
 * the button CSS copy-pasted across `AirSideMenu.vue`, `SpaceSideMenu.vue`,
 * `MapSidebar.vue`, and `SettingsPanel.vue`/`.css` — see those files' own
 * `<style>` blocks for what still lives there (site-specific accordion/rail
 * container layout, not button chrome).
 *
 * - `variant="rail"` — the full-width, transparent icon-rail button used by
 *   the Air/Space side-menu rails, MapSidebar's tab rail, and the Settings
 *   panel's section nav (`.sm-btn`, `.msb-rail-btn`, `.settings-nav-item`).
 *   `bordered` switches on the left-accent-border + tinted-background active
 *   look used by the Settings panel's section nav (as opposed to the plain
 *   colour-only active state used by every map rail — Air/Space right rails,
 *   MapSidebar's left tab rail, and the SDR left rail) — see
 *   `BaseButtonProps.bordered`.
 * - `variant="ghost"` — the neutral rgba-fill action button used throughout
 *   the Settings panel's TLE/SDR-devices editors (`.tle-action-btn`,
 *   `.settings-config-btn`, `.sdr-devices-btn`, …).
 * - `variant="primary"` — the lime "commit" action (`#settings-apply-btn`,
 *   `.tle-action-btn--primary`, `.sdr-devices-btn--primary`, …).
 * - `variant="danger"` — the destructive/warning action
 *   (`.tle-action-btn--danger`, …). Some small icon/chip-style destructive
 *   controls elsewhere in the Settings panel (e.g. `SdrDevicesControl.vue`'s
 *   per-device delete icon, `SpaceTleDatabaseControl.vue`'s per-category
 *   `.tle-cat-clear` chip) are a genuinely different shape/size family —
 *   they stay on their own scoped CSS rather than being forced into this
 *   variant.
 *
 * Callers needing a pixel-exact deviation from a variant's default sizing or
 * hover/active colour (e.g. MapSidebar's shorter, differently-tinted FILTER
 * sub-tabs, which also sit on a solid panel background instead of the rail's
 * transparent default) override the relevant CSS custom property via an
 * inline `style` binding rather than the component growing more props for
 * every one-off; see `MapSidebar.vue` for a real rail example. Each variant's
 * hooks:
 * - `rail`: `--ba-rail-height`, `--ba-rail-bg`, `--ba-rail-hover-bg`,
 *   `--ba-rail-active-bg`.
 * - `ghost`: `--ba-ghost-height`, `--ba-ghost-padding`, `--ba-ghost-font-size`,
 *   `--ba-ghost-color`, `--ba-ghost-hover-color`, `--ba-ghost-bg`,
 *   `--ba-ghost-hover-bg`, `--ba-ghost-radius`, `--ba-ghost-font-weight`,
 *   `--ba-ghost-letter-spacing` — e.g. `SdrDeviceForm.vue`'s
 *   CANCEL button, which is shorter, smaller-type, and dimmer than the
 *   default ghost look; `ConfigCurrentControl.vue`/`JsonDataControl.vue`/
 *   `ExportAllControl.vue`'s EDIT/EXPORT buttons, whose hover darkens the text
 *   slightly (the default ghost hover leaves text colour unchanged); or the
 *   SDR panel's `.sdr-panel-btn` CANCEL/SAVE/ADD family (`SdrPanel.css`),
 *   which restyles the light ghost to the panel's dark flat look (the bg and
 *   hover-bg hooks exist for exactly this dark-theme mirror).
 * - `primary`: `--ba-primary-height`, `--ba-primary-padding`,
 *   `--ba-primary-font-size`, `--ba-primary-font-weight`,
 *   `--ba-primary-letter-spacing` — e.g. `SdrDeviceForm.vue`'s SAVE button
 *   (sized to match its sibling CANCEL ghost button rather than the full-size
 *   `#settings-apply-btn` look) and `SpaceTleOnlineControl.vue`/
 *   `SpaceTleManualControl.vue`'s UPDATE TLE button (sized to match its
 *   sibling plain `tle-action-btn`).
 * - `danger`: `--ba-danger-bg`, `--ba-danger-color` — e.g.
 *   `SpaceTleDatabaseControl.vue`'s CLEAR ALL button, which swaps to an amber
 *   "confirm this?" tint while a destructive action is pending (hover keeps
 *   the plain danger red, matching the pre-BaseButton CSS's cascade).
 * - any variant, disabled state: `--ba-disabled-opacity`, `--ba-disabled-cursor`
 *   — most disableable buttons share this component's default dimmed/
 *   not-allowed look, but a few pre-existing button classes disabled
 *   differently (or not at all) and set these to match, e.g. the TLE action
 *   buttons' lighter 0.4 opacity + default cursor, or `SdrDeviceForm.vue`'s
 *   SAVE button, which previously had no disabled treatment at all.
 */
interface BaseButtonProps {
  variant?: BaseButtonVariant
  /**
   * Rail-only. Adds the left accent border and a faint accent background
   * tint while `active` (Settings panel's section nav) instead of the plain
   * colour-only active state shared by all map rails (Air/Space side-menu
   * rails, MapSidebar's tab rail, the SDR rail). Ignored for other variants.
   * Defaults to `false`.
   */
  bordered?: boolean
  /** Marks the button as the current selection/toggle-on state. Defaults to `false`. */
  active?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

withDefaults(defineProps<BaseButtonProps>(), {
  variant: 'ghost',
  bordered: false,
  active: false,
  disabled: false,
  type: 'button',
})
</script>

<template>
  <button
    class="ba-btn"
    :class="[
      `ba-btn--${variant}`,
      { 'ba-btn--active': active, 'ba-btn--bordered': bordered && variant === 'rail' },
    ]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.ba-btn {
  cursor: pointer;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
}

.ba-btn:disabled {
  cursor: var(--ba-disabled-cursor, not-allowed);
  opacity: var(--ba-disabled-opacity, 0.5);
}

/* ---- rail: full-width, transparent icon-rail button ---- */
.ba-btn--rail {
  height: var(--ba-rail-height, 40px);
  width: 100%;
  flex-shrink: 0;
  background: var(--ba-rail-bg, none);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0;
  transition: var(--ba-rail-transition, color 0.15s, background 0.15s, border-color 0.15s);
}

.ba-btn--rail:hover {
  color: var(--color-text-muted);
  background: var(--ba-rail-hover-bg, var(--color-border));
}

.ba-btn--rail.ba-btn--active {
  color: var(--color-accent);
}

.ba-btn--rail.ba-btn--bordered {
  border-left: 2px solid transparent;
}

.ba-btn--rail.ba-btn--bordered.ba-btn--active {
  background: var(--ba-rail-active-bg, rgba(200, 255, 0, 0.08));
  border-left-color: var(--color-accent);
}

/* Matches the icon rails' shared sizing regardless of each SVG's own
   width/height attributes; width auto keeps non-square icons in proportion. */
.ba-btn--rail :deep(svg) {
  display: block;
  height: 19px;
  width: auto;
}

/* ---- ghost: neutral rgba-fill action button ---- */
.ba-btn--ghost {
  background: var(--ba-ghost-bg, rgba(16, 19, 29, 0.06));
  border: none;
  border-radius: var(--ba-ghost-radius, 6px);
  height: var(--ba-ghost-height, 37px);
  padding: var(--ba-ghost-padding, 0 18px);
  color: var(--ba-ghost-color, rgba(16, 19, 29, 0.85));
  font-size: var(--ba-ghost-font-size, 11px);
  font-weight: var(--ba-ghost-font-weight, 600);
  letter-spacing: var(--ba-ghost-letter-spacing, 0.16em);
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
  transition:
    background 0.15s,
    color 0.15s;
}

.ba-btn--ghost:hover:not(:disabled) {
  background: var(--ba-ghost-hover-bg, rgba(16, 19, 29, 0.12));
  color: var(--ba-ghost-hover-color, var(--ba-ghost-color, rgba(16, 19, 29, 0.85)));
}

/* ---- primary: lime "commit" action ---- */
.ba-btn--primary {
  background: var(--color-accent);
  border: none;
  border-radius: 6px;
  /* No default explicit height: the default look's 12px top/bottom padding
     plus its text line-height already lands at ~37px. Sites that shrink the
     padding (e.g. the TLE "UPDATE TLE" buttons, matching their sibling
     tle-action-btn's fixed 37px) set --ba-primary-height explicitly instead. */
  height: var(--ba-primary-height, auto);
  padding: var(--ba-primary-padding, 12px 30px);
  color: #0a0c10;
  font-size: var(--ba-primary-font-size, 11px);
  font-weight: var(--ba-primary-font-weight, 700);
  letter-spacing: var(--ba-primary-letter-spacing, 0.18em);
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
  transition: background 0.15s;
}

.ba-btn--primary:hover:not(:disabled) {
  background: #d8ff33;
}

/* ---- danger: destructive/warning action ---- */
.ba-btn--danger {
  background: var(--ba-danger-bg, rgba(255, 90, 80, 0.1));
  border: none;
  border-radius: 6px;
  height: 37px;
  padding: 0 18px;
  color: var(--ba-danger-color, #d94436);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
  transition:
    background 0.15s,
    color 0.15s;
}

.ba-btn--danger:hover:not(:disabled) {
  background: rgba(255, 90, 80, 0.18);
  color: #c23a2d;
}
</style>
