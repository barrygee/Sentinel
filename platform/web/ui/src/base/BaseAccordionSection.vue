<template>
  <button
    type="button"
    :class="[
      'base-accordion-toggle',
      `base-accordion-toggle--${variant}`,
      { 'base-accordion-toggle--expanded': variant === 'section' && expanded },
    ]"
    :aria-expanded="expanded"
    :aria-controls="bodyId"
    @click="expanded = !expanded"
  >
    <span class="base-accordion-title">{{ title }}</span>
    <slot name="header-extra" />
    <span v-if="variant === 'section'" class="base-accordion-chevron">
      <ChevronIcon />
    </span>
    <ChevronIcon v-else :open="expanded" />
  </button>
  <!-- v-bind (not :class) so that without bodyClass the body renders with no
       class attribute at all, matching the pre-extraction id-only divs. -->
  <div v-show="expanded" :id="bodyId" v-bind="bodyClass ? { class: bodyClass } : {}">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * `BaseAccordionSection` — a disclosure header button plus its collapsible
 * body. It started in the SDR panel (SCANNER, SEARCH, SETTINGS, the RADIO
 * SETTINGS form toggle) and owns its own look, so other sections can use it
 * without borrowing SDR styles (Land's REPEATER FILTERS does).
 *
 * Two looks — variants, not free-form class props:
 * - `variant="section"` (default) — a 44px uppercase section bar with the
 *   chevron in a rotating wrapper on the right. The header carries
 *   `base-accordion-toggle--expanded` while open, which callers' layout rules
 *   (e.g. SDR's `:has()` sizing) key on.
 * - `variant="form"` — a compact 36px toggle that fits inside a form's padding,
 *   with a bare `ChevronIcon` driven by its `open` prop.
 *
 * Layout knobs for the section variant, set on any ancestor:
 * - `--ba-accordion-inset` — left padding before the title (default 24px).
 * - `--ba-accordion-bleed` — how far the bar extends past its container on
 *   both sides (default 0). SDR uses 20px to span its padded sections.
 * - `--ba-accordion-gap` — space under the bar (default 0).
 *
 * The expanded state stays caller-owned (`v-model:expanded`) — `SdrPanel`
 * collapses its sections whenever the side panel opens. The header button and
 * body `<div v-show>` render as adjacent siblings, which
 * DOM-dependent selectors (and the existing specs) rely on.
 *
 * Slots:
 * - default — the collapsible body content.
 * - `#header-extra` — optional content between the title and the chevron
 *   (e.g. the SCANNER/SEARCH activity-state rows).
 */
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'

/** Whether the body is expanded (caller-owned so panels can collapse sections). */
const expanded = defineModel<boolean>('expanded', { required: true })

withDefaults(
  defineProps<{
    /** The header text (rendered uppercase). */
    title: string
    /** The body element's id, also wired to the header's `aria-controls`. */
    bodyId: string
    /** Which spec-pinned header/body look to render (see the component doc). */
    variant?: 'section' | 'form'
    /** Extra class(es) for the body element (e.g. `sdr-ef-settings-grid`). */
    bodyClass?: string
  }>(),
  // No bodyClass default: absent means the body renders with no class
  // attribute at all (the section sites' bodies are bare id-only divs).
  { variant: 'section', bodyClass: undefined },
)
</script>

<style scoped>
.base-accordion-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
}

.base-accordion-title {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-strong);
}

/* ── section ── */
.base-accordion-toggle--section {
  position: relative;
  /* The bleed widens the bar past a padded container on both sides; the inset
     then puts the title back on the container's content edge. */
  width: calc(100% + 2 * var(--ba-accordion-bleed, 0px));
  height: 44px;
  margin: 0 calc(-1 * var(--ba-accordion-bleed, 0px)) var(--ba-accordion-gap, 0px);
  padding: 0 44px 0 var(--ba-accordion-inset, 24px);
  font: inherit;
  transition: background 0.12s;
}

.base-accordion-toggle--section .base-accordion-title {
  display: block;
}

/* Hover and open state light the chevron accent, never a background wash,
   which read as heavy across a panel of stacked section bars. Hovering a
   closed bar previews the open colour. */
.base-accordion-chevron {
  position: absolute;
  right: 20px;
  top: 0;
  bottom: 0;
  height: 44px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: rgba(var(--ink-rgb), 0.25);
  transform: rotate(-90deg);
  transition:
    transform 0.2s ease,
    color 0.15s;
  pointer-events: none;
}

.base-accordion-toggle--section:hover .base-accordion-chevron {
  color: var(--accent-text);
}

.base-accordion-toggle--expanded .base-accordion-chevron {
  transform: rotate(0deg);
  color: var(--accent-text);
}

/* ── form ── */
.base-accordion-toggle--form {
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0;
  /* ChevronIcon strokes with currentColor; the title sets its own colour, so
     only the chevron dims and lights on hover. */
  color: rgba(var(--ink-rgb), 0.5);
}

.base-accordion-toggle--form:hover {
  color: var(--accent-text);
}
</style>
