<template>
  <div class="bfp-input-wrap" :style="{ '--bfp-accent': accentColor }">
    <input
      :id="`${idPrefix}-input`"
      ref="inputRef"
      class="bfp-input"
      type="text"
      role="combobox"
      :aria-label="inputLabel"
      aria-autocomplete="list"
      :aria-expanded="listboxShown"
      :aria-controls="listboxShown ? `${idPrefix}-listbox` : undefined"
      :aria-activedescendant="activeDescId"
      :placeholder="placeholder"
      autocomplete="off"
      spellcheck="false"
      :value="query"
      @input="onInput"
      @keydown="onKeydown"
    />
    <BaseIconAction
      :id="`${idPrefix}-clear-btn`"
      class="bfp-clear-btn"
      :active="query.length > 0"
      active-class="bfp-clear-visible"
      accessible-name="Clear filter"
      @click="clearQuery"
    >
      ✕
    </BaseIconAction>
  </div>
  <!-- Optional controls that sit between the search box and the results and
       stay put while the results scroll — the Land pane's repeater BAND /
       MODE / STATUS accordion. Nothing renders when the slot is empty. -->
  <slot name="below-input" />
  <!-- The scroll container is keyboard-focusable (WCAG 2.1.1 / axe
       scrollable-region-focusable): when rows overflow, none of the content is
       tabbable — options are driven from the combobox via aria-activedescendant
       by design — so without a tab stop a keyboard user could never scroll the
       overflowing results. role="group" + a name keeps the stop meaningful to
       assistive tech without disturbing the combobox/listbox structure. -->
  <div
    :id="`${idPrefix}-results`"
    class="bfp-results"
    role="group"
    aria-label="Filter results"
    tabindex="0"
    :style="{ '--bfp-accent': accentColor }"
  >
    <!-- Empty structural listbox: it OWNS the option rows below via aria-owns.
         The rows can't live inside it because each carries non-option chrome
         (the chevron, and — when expanded — an accordion of data grids) that a
         listbox/option subtree may not contain. -->
    <div
      v-if="listboxShown"
      :id="`${idPrefix}-listbox`"
      role="listbox"
      :aria-label="listboxLabel"
      :aria-owns="ownedOptionIds"
    ></div>

    <div v-if="items.length === 0" class="bfp-no-results">{{ emptyMessage }}</div>
    <div v-else class="bfp-results-body">
      <template v-for="(item, index) in items" :key="item.key">
        <!-- A group heading opens each run of rows that share a `groupLabel`
             (a camera feed's cameras, say) and collapses the run on click, so a
             source with hundreds of rows can be folded away. It is a plain
             disclosure button outside the listbox: keyboard row navigation and
             `aria-activedescendant` only ever see the rows of open groups. -->
        <button
          v-if="item.groupLabel && item.groupLabel !== items[index - 1]?.groupLabel"
          type="button"
          class="bfp-group-heading"
          :class="{ 'bfp-group-heading--collapsed': isGroupCollapsed(item.groupLabel) }"
          :aria-expanded="!isGroupCollapsed(item.groupLabel)"
          @click.stop="toggleGroup(item.groupLabel)"
        >
          <span class="bfp-group-heading-label">{{ item.groupLabel }}</span>
          <span v-if="item.groupMeta" class="bfp-group-heading-meta">{{ item.groupMeta }}</span>
          <span class="bfp-group-heading-chevron"><ChevronIcon /></span>
          <span v-if="item.groupNote" class="bfp-group-heading-note">{{ item.groupNote }}</span>
        </button>
        <div
          v-if="!item.groupLabel || !isGroupCollapsed(item.groupLabel)"
          :id="`${idPrefix}-row-${idToken(item)}`"
          :ref="(element) => registerRow(item.key, element)"
          class="bfp-result-item"
          :class="[
            item.rowClass,
            {
              'bfp-expanded': expandedKey === item.key,
              'bfp-keyboard-focused': focusedKey === item.key,
            },
          ]"
          @click="toggleExpanded(item.key)"
          @mouseenter="emit('rowEnter', item.key)"
          @mouseleave="emit('rowLeave')"
        >
          <!-- The option is just the row header (identity + chevron); the expanded
             accordion is a sibling so its content isn't nested inside the option. -->
          <div
            :id="`${idPrefix}-opt-${idToken(item)}`"
            role="option"
            :aria-selected="focusedKey === item.key"
            :aria-label="item.optionLabel ?? optionLabel(item)"
            class="bfp-result-option"
          >
            <div class="bfp-result-info">
              <div class="bfp-result-primary">{{ item.primary }}</div>
              <div v-if="item.secondary" class="bfp-result-secondary">{{ item.secondary }}</div>
            </div>
            <!-- A row that carries no accordion shows no chevron: the disclosure
               cue would promise an expansion that never happens. Its trailing
               slot (a badge, say) takes the same place. -->
            <span v-if="item.expandable !== false" class="bfp-item-chevron">
              <ChevronIcon />
            </span>
            <span v-else class="bfp-item-trailing">
              <slot name="row-trailing" :item="item" />
            </span>
          </div>
          <!-- The accordion is nested in the row so it moves with it, but it is
             disclosed content, not part of the row's hit target: without
             stopping the click here, using anything inside it (a button, or
             just a stray click on a value) would bubble to the row handler and
             shut the accordion under the user's cursor. -->
          <div v-if="expandedKey === item.key" class="bfp-accordion-body" @click.stop>
            <slot name="accordion" :item="item" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Searchable, single-expand result list for a map sidebar's FILTER pane.
 *
 * Owns the shell every domain's filter pane shares — the combobox text field and
 * its ARIA wiring, the structural listbox that claims the rows via `aria-owns`,
 * roving keyboard navigation, the focusable scroll region, and the expanded-row
 * accordion — so a domain only supplies its rows and what goes inside an
 * expanded one.
 *
 * Filtering itself stays with the caller: it knows which of its fields are
 * searchable, and passes the already-matching `items`.
 */
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import BaseIconAction from '@/components/base/BaseIconAction.vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'

/** One row in the list. */
export interface FilterPanelItem {
  /** Stable identity — also the value reported by `select`/`update:expandedKey`. */
  key: string
  primary: string
  secondary?: string
  /** Accessible name for the option, when the visible text isn't enough. */
  optionLabel?: string
  /**
   * Token used to build this row's element ids, when `key` is unsuitable —
   * a key holding a space (a base name, say) would split the `aria-owns`
   * list, which is space-separated, into dangling IDREFs. Must be unique
   * within the rendered set. Defaults to `key`.
   */
  idKey?: string
  /** Extra class(es) on the row, for a caller's state styling. */
  rowClass?: string
  /**
   * Whether clicking this row opens an accordion. `false` suppresses the
   * chevron and shows the `row-trailing` slot instead — the row is still a
   * selectable option, it just has nothing to disclose.
   */
  expandable?: boolean
  /**
   * Optional group this row belongs to. Consecutive rows sharing a label are
   * introduced by one heading carrying the label, an optional `groupMeta`
   * (a count, say) and an optional `groupNote` (an attribution line). Callers
   * keep grouped rows contiguous; the panel only compares neighbours.
   */
  groupLabel?: string
  groupMeta?: string
  groupNote?: string
}

const props = withDefaults(
  defineProps<{
    items: FilterPanelItem[]
    /** Current search text (use with `v-model:query`). */
    query: string
    /** Key of the expanded row, empty when none (use with `v-model:expandedKey`). */
    expandedKey: string
    /** Prefix for every generated element id — must be unique per pane. */
    idPrefix: string
    inputLabel: string
    placeholder: string
    listboxLabel: string
    emptyMessage?: string
    accentColor?: string
    /**
     * What Enter does when no row is virtually focused yet: activate the first
     * row (the default), or only move the virtual focus onto it, leaving a
     * second Enter to activate. The latter suits a pane whose activation moves
     * the map, where acting on a row the user never pointed at is a surprise.
     */
    enterActivatesFirstRow?: boolean
    /**
     * Whether typing drops the virtual focus. Suits a list whose rows are
     * re-ordered by the query, where keeping the focus on a row that has just
     * moved is more confusing than starting the walk again.
     */
    clearFocusOnInput?: boolean
    /**
     * Whether groups start folded shut. Suits a pane whose groups are long
     * lists the user picks from (a camera feed's every camera, say), where
     * opening on a wall of rows hides the group headings themselves. A search
     * query opens every group regardless, so a match is never folded away.
     */
    groupsCollapsedByDefault?: boolean
  }>(),
  {
    emptyMessage: 'No results',
    accentColor: 'var(--color-accent)',
    enterActivatesFirstRow: true,
    clearFocusOnInput: false,
    groupsCollapsedByDefault: false,
  },
)

const emit = defineEmits<{
  'update:query': [query: string]
  'update:expandedKey': [key: string]
  select: [key: string]
  /**
   * The query was cleared deliberately (Escape or the clear button) rather
   * than edited down to empty — distinct because a caller may want to reset
   * more than the text.
   */
  clear: []
  /**
   * The pointer entered/left a row — for a caller that previews the row's
   * subject elsewhere (highlighting it on the map, say) while it is hovered.
   */
  rowEnter: [key: string]
  rowLeave: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)
// The row the combobox is virtually focused on during arrow-key navigation.
// Distinct from the expanded row: you can walk the list without opening rows.
const focusedKey = ref<string | null>(null)

/** Group labels the user has flipped away from the default state (open, or
 *  shut under `groupsCollapsedByDefault`). Pane-local: a group returns to its
 *  default on remount. */
const toggledGroups = ref(new Set<string>())

/** Whether a group's rows are hidden right now. A live query overrides the
 *  fold so every match shows — see `groupsCollapsedByDefault`. */
function isGroupCollapsed(groupLabel: string): boolean {
  if (props.query.trim() !== '') return false
  return props.groupsCollapsedByDefault !== toggledGroups.value.has(groupLabel)
}

function toggleGroup(groupLabel: string): void {
  const next = new Set(toggledGroups.value)
  if (next.has(groupLabel)) next.delete(groupLabel)
  else next.add(groupLabel)
  toggledGroups.value = next
  // A row inside a group that just closed can no longer be the active
  // descendant; drop the virtual focus rather than point at a hidden option.
  if (focusedKey.value && !visibleItems.value.some((item) => item.key === focusedKey.value)) {
    focusedKey.value = null
  }
}

/** The rows actually rendered — everything except rows of collapsed groups. */
const visibleItems = computed<FilterPanelItem[]>(() =>
  props.items.filter((item) => !item.groupLabel || !isGroupCollapsed(item.groupLabel)),
)

/** The token a row's element ids are built from (see FilterPanelItem.idKey). */
function idToken(item: FilterPanelItem): string {
  return item.idKey ?? item.key
}

// Space-separated ids of every rendered option, in visual order. The listbox
// claims these via aria-owns — they live outside it in the DOM so the row's
// chevron and accordion chrome stay valid.
const ownedOptionIds = computed<string>(() =>
  visibleItems.value.map((item) => `${props.idPrefix}-opt-${idToken(item)}`).join(' '),
)

// The combobox popup only exists when at least one option is rendered — an empty
// listbox would fail aria-required-children, and a combobox with no visible
// options should report aria-expanded=false.
const listboxShown = computed<boolean>(() => ownedOptionIds.value.length > 0)

// Always references a rendered option: `focusedKey` is only ever set to a key
// taken from `items`, and the watcher below clears it the moment that row goes.
const activeDescId = computed<string | undefined>(() => {
  const focused = visibleItems.value.find((item) => item.key === focusedKey.value)
  return focused ? `${props.idPrefix}-opt-${idToken(focused)}` : undefined
})

function optionLabel(item: FilterPanelItem): string {
  return item.secondary ? `${item.primary}, ${item.secondary}` : item.primary
}

function onInput(event: Event): void {
  emit('update:query', (event.target as HTMLInputElement).value)
  if (props.clearFocusOnInput) focusedKey.value = null
}

function clearQuery(): void {
  emit('update:query', '')
  emit('clear')
  inputRef.value?.focus()
}

function toggleExpanded(key: string): void {
  const next = props.expandedKey === key ? '' : key
  emit('update:expandedKey', next)
  if (next) emit('select', key)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    clearQuery()
    return
  }
  const items = visibleItems.value
  if (!items.length) return
  const index = items.findIndex((item) => item.key === focusedKey.value)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusKey((items[index + 1] ?? items[0]).key)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    // Stepping up past the first row returns focus to the text field itself,
    // so the whole list is escapable without reaching for the mouse.
    if (index <= 0) {
      focusedKey.value = null
      return
    }
    focusKey(items[index - 1].key)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const focused = items.find((item) => item.key === focusedKey.value)
    if (focused) {
      toggleExpanded(focused.key)
      return
    }
    // Nothing focused yet. The list is known non-empty here, so the first row
    // is always a valid target — either to act on or just to focus.
    if (props.enterActivatesFirstRow) toggleExpanded(items[0].key)
    else focusKey(items[0].key)
  }
}

// Move the virtual focus and keep the row it lands on visible: the rows are
// never tabbable (the combobox drives them via aria-activedescendant), so
// nothing else scrolls the list as the keyboard walks past the fold.
function focusKey(key: string): void {
  focusedKey.value = key
  void nextTick(() => rowElements.get(key)?.scrollIntoView({ block: 'nearest' }))
}

// Row elements by key, so the scroll-into-view below can reach a row directly.
// Held as refs rather than looked up by id selector: an item key is caller data
// and can contain characters a selector would need escaped.
const rowElements = new Map<string, HTMLElement>()
function registerRow(key: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) rowElements.set(key, element)
  else rowElements.delete(key)
}

// Bring the expanded row into view whichever way it was expanded — including
// from outside this component (a map click selecting a target), where the row
// may be well below the fold.
watch(
  () => props.expandedKey,
  async (key) => {
    if (!key) return
    await nextTick()
    rowElements.get(key)?.scrollIntoView({ block: 'nearest' })
  },
)

// Keep the virtual focus on a row that still exists: in a live list the focused
// row can vanish (an APRS station expiring, an aircraft leaving range).
watch(
  () => visibleItems.value,
  (items) => {
    if (focusedKey.value && !items.some((item) => item.key === focusedKey.value)) {
      focusedKey.value = null
    }
  },
)

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style scoped>
.bfp-input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  /* Match the height of the FILTER rail tab button (.msb-rail-btn). */
  height: 40px;
  padding: 0 20px 0 24px;
  background: var(--color-search-field-bg);
  box-sizing: border-box;
  transition: background 0.12s;
}

/* Drop the global a11y focus ring (assets/a11y.css :focus-visible); the accent
   caret is this field's visible focus cue (WCAG 2.4.7). */
.bfp-input:focus-visible {
  outline: none !important;
}

.bfp-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--ink-strong);
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  caret-color: var(--bfp-accent);
  min-width: 0;
}

.bfp-input::placeholder {
  color: rgba(var(--ink-rgb), 0.2);
  font-size: 11px;
  letter-spacing: 0.14em;
}

.bfp-clear-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(var(--ink-rgb), 0.3);
  font-family: 'Barlow', sans-serif;
  font-size: 10px;
  font-weight: 700;
  padding: 0;
  margin-right: 6px;
  display: none;
  transition: color 0.15s;
  flex-shrink: 0;
}

.bfp-clear-btn.bfp-clear-visible {
  display: block;
}

.bfp-clear-btn:hover {
  color: var(--color-text-muted);
}

.bfp-results {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
}

.bfp-results::-webkit-scrollbar {
  display: none;
}

.bfp-results-body {
  display: flex;
  flex-direction: column;
}

/* Group heading: the same label voice as a data-grid title, set on the panel
   surface with no rule above or below — the change of type does the work. */
.bfp-group-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  width: 100%;
  /* Sized to a result row (13px padding around a two-line body ≈ 63px), so
     a run of collapsed groups reads with the same rhythm as the rows. */
  padding: 22px 24px;
  margin: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-family: 'Barlow', sans-serif;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.bfp-group-heading-chevron {
  margin-left: auto;
  display: inline-flex;
  color: rgba(var(--ink-rgb), 0.4);
  transition: transform 0.15s;
}
.bfp-group-heading--collapsed .bfp-group-heading-chevron {
  transform: rotate(-90deg);
}
@media (prefers-reduced-motion: reduce) {
  .bfp-group-heading-chevron {
    transition: none;
  }
}
.bfp-group-heading-label {
  font-size: 10px;
  font-weight: 700;
  color: rgba(var(--ink-rgb), 0.75);
}
.bfp-group-heading-meta {
  font-size: 9px;
  font-weight: 500;
  color: rgba(var(--ink-rgb), 0.4);
}
.bfp-group-heading-note {
  flex-basis: 100%;
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: none;
  color: rgba(var(--ink-rgb), 0.4);
}

.bfp-no-results {
  padding: 18px 24px;
  font-family: 'Barlow', sans-serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.35);
}

.bfp-result-item {
  display: flex;
  flex-direction: column;
  position: relative;
  cursor: pointer;
  transition: background 0.12s;
}

/* The row header is the positioning context for the chevron and the trailing
   slot: anchoring them to the row itself would centre them over the row PLUS its
   expanded accordion, dragging them off the header they belong to. */
.bfp-result-option {
  position: relative;
}

.bfp-result-option > .bfp-result-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 13px 52px 13px 24px;
  min-width: 0;
}

/* The input→first-row breathing room lives INSIDE the first row's header rather
   than as padding on the list above it: an expanded row paints a background, and
   a gap held outside the row leaves that background starting below a torn strip
   of untinted space. Kept as a custom property so a pane can retune the gap
   (see AirFilter) without moving it back outside the tint. */
.bfp-result-item:first-child > .bfp-result-option > .bfp-result-info {
  padding-top: calc(13px + var(--bfp-results-top-gap, 9px));
}

/* Hover lights the chevron rather than washing the row; keyboard focus keeps a
   background + outline, since that is what marks the active row during arrow-key
   navigation, which the chevron cue alone does not track. */
/* Both tints paint the header and the accordion body directly rather than the
   row that contains them: painting the row would put a layer *under* whichever
   of them is also tinted, and two translucent layers read lighter than either
   one. Keeping them siblings means the focus tint below can replace the
   expanded tint on the header instead of stacking on it. Both are
   caller-overridable so a pane keeps the exact weight it had before it moved
   onto this shell. */
.bfp-result-item.bfp-expanded > .bfp-result-option,
.bfp-result-item.bfp-expanded > .bfp-accordion-body {
  background: var(--bfp-row-highlight, rgba(var(--ink-rgb), 0.04));
}

/* The keyboard cue marks the OPTION — the row header — not the row element,
   which also contains the expanded accordion. Outlining the row would draw the
   focus ring around the whole open accordion, which says the accordion is the
   focused thing and swamps the cue on a tall one. Declared after the expanded
   tint so a focused row that is also open shows the focus weight on its header.
 */
.bfp-result-item.bfp-keyboard-focused > .bfp-result-option {
  background: var(--bfp-focus-highlight, var(--bfp-row-highlight, rgba(var(--ink-rgb), 0.04)));
  outline: 1px solid var(--bfp-focus-outline, var(--bfp-accent));
  outline-offset: -1px;
}

.bfp-result-primary {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--ink-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bfp-result-secondary {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.08em;
  color: rgba(var(--ink-rgb), 0.4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bfp-item-chevron {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  padding: 0 20px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: rgba(var(--ink-rgb), 0.25);
  transition:
    transform 0.2s ease,
    color 0.15s;
  transform: rotate(-90deg);
  pointer-events: none;
}

/* Sits where the chevron would, so a row's trailing chrome lines up down the
   list whether it discloses an accordion or not. */
.bfp-item-trailing {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  padding: 0 20px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.bfp-result-item:hover .bfp-item-chevron,
.bfp-result-item.bfp-expanded .bfp-item-chevron {
  color: var(--bfp-accent);
}

.bfp-result-item.bfp-expanded .bfp-item-chevron {
  transform: rotate(0deg);
}

.bfp-accordion-body {
  display: flex;
  flex-direction: column;
  animation: bfp-expand 0.18s ease;
}

/* Respect a reduced-motion preference: the expand animation is decorative. */
@media (prefers-reduced-motion: reduce) {
  .bfp-accordion-body {
    animation: none;
  }
}

@keyframes bfp-expand {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
