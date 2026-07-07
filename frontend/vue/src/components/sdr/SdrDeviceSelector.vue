<template>
  <div
    ref="dropdownRef"
    class="sdr-device-dropdown"
    :class="{
      'sdr-device-dropdown--loading': loading,
      'sdr-device-dropdown--open': menuOpen,
    }"
    role="combobox"
    tabindex="0"
    aria-label="Radio device"
    aria-haspopup="listbox"
    aria-controls="sdr-device-listbox"
    aria-owns="sdr-device-listbox"
    :aria-expanded="menuOpen"
    :aria-activedescendant="activeDescId"
    @click.stop="toggleMenu"
    @keydown="onDropdownKey"
  >
    <div class="sdr-device-dropdown-selected">
      <div
        class="sdr-conn-dot"
        :class="connected ? 'sdr-dot-on' : 'sdr-dot-off'"
        :title="connected ? 'CONNECTED' : 'DISCONNECTED'"
      ></div>
      <span
        class="sdr-device-dropdown-text"
        :class="{
          'sdr-device-dropdown-text--chosen': selectedRadioId !== null,
          'sdr-device-dropdown-text--readonly': readOnly,
        }"
        >{{ label }}</span
      >
      <!-- Padlock shown when another Sentinel controls the shared tuner;
           decorative here (the sr-only status below announces the state). -->
      <svg
        v-if="readOnly"
        class="sdr-device-lock"
        width="12"
        height="12"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 6V4.5a3 3 0 0 1 6 0V6m-7 0h8v6H3V6Z"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
        />
      </svg>
      <span class="sdr-device-dropdown-arrow"></span>
    </div>
  </div>
  <span v-if="readOnly" class="sr-only" role="status"
    >Another Sentinel is controlling this radio</span
  >
  <Teleport to="body">
    <div
      v-if="menuOpen"
      class="sdr-device-menu sdr-device-menu--open"
      :style="menuStyle"
      @click.stop
    >
      <div id="sdr-device-listbox" role="listbox" aria-label="Available radios">
        <div
          :id="optionId(0)"
          role="option"
          class="sdr-device-menu-item sdr-device-menu-placeholder"
          :class="{ 'sdr-device-menu-item--active': highlight === 0 }"
          :aria-selected="highlight === 0"
          @click="pickRadio(null)"
          @mousemove="highlight = 0"
        >
          — select radio —
        </div>
        <div
          v-for="(r, index) in menuRadios"
          :id="optionId(index + 1)"
          :key="r.id"
          role="option"
          class="sdr-device-menu-item"
          :class="{
            'sdr-device-menu-item--active': highlight === index + 1,
            'sdr-device-menu-item--readonly': isRadioReadOnly(r),
          }"
          :aria-selected="highlight === index + 1"
          @click="pickRadio(r)"
          @mousemove="highlight = index + 1"
        >
          <span class="sdr-device-menu-item-label"
            >{{ r.name }}<span class="sdr-device-menu-item-host">{{ r.host }}</span></span
          >
          <!-- Padlock: this radio is controlled by another Sentinel. Only the
               connected radio's lock is known, so only its row is marked. -->
          <svg
            v-if="isRadioReadOnly(r)"
            class="sdr-device-lock sdr-device-menu-item-lock"
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6V4.5a3 3 0 0 1 6 0V6m-7 0h8v6H3V6Z"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>
      <!-- Non-selectable status note lives outside the listbox. -->
      <div v-if="menuRadios.length === 0" class="sdr-device-menu-item sdr-device-menu-placeholder">
        no radios configured
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * SdrDeviceSelector — the RADIO tab's device combobox: connection dot, the
 * selected radio's name (with the read-only follower padlock + sr-only
 * announcement) and the body-teleported listbox of enabled radios with full
 * keyboard navigation (arrows/Home/End move the highlight, Enter/Space
 * selects, Escape/Tab close).
 *
 * Selection is the parent's ENGINE concern — picking a row only emits
 * `select`; the parent's selectRadio() owns the control-socket lifecycle,
 * ownership release and label/state updates, which is also why `label`,
 * `loading`, `connected` and `selectedRadioId` arrive as props rather than
 * living here.
 *
 * The menu list is re-read from the store at open time (the store owns
 * `radios`). Reachability is deliberately NOT probed here: rtl_tcp is
 * single-client, so a throwaway probe socket disturbs the dongle — the
 * connection dot reflects the real control connection instead.
 *
 * Owns its dismiss behaviour like the other extracted pickers: outside click,
 * Escape, panel scroll past the open-settle window, and window resize.
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue).
 */
import { ref, computed } from 'vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useWindowEvent } from '@/composables/useWindowEvent'
import { useSdrStore } from '@/stores/sdr'
import type { SdrRadio } from '@/stores/sdr'
import { MENU_OPEN_SETTLE_MS } from './sdrPanelUtils'

const props = defineProps<{
  /** Text shown in the trigger (radio name / placeholder / loading…). */
  label: string
  /** True until the radio list has been loaded (renders the loading style). */
  loading: boolean
  /** Whether the control connection to the selected radio is up (dot colour). */
  connected: boolean
  /** The currently selected radio id, or null when none is selected. */
  selectedRadioId: number | null
}>()

const emit = defineEmits<{
  /** A row was picked: the parent selects the radio (null = deselect). */
  (event: 'select', radio: SdrRadio | null): void
}>()

const sdrStore = useSdrStore()
const readOnly = computed(() => sdrStore.readOnly)

// A dropdown row is shown read-only (red + padlock) when this instance is a
// follower AND the row is the radio we're connected to — the only radio whose
// lock state we actually know (its control channel is the one we're on).
function isRadioReadOnly(radio: SdrRadio): boolean {
  return readOnly.value && radio.id === props.selectedRadioId
}

const dropdownRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
// 0 = the "select radio" placeholder, 1..N = menuRadios[index-1].
const highlight = ref(0)
const menuRadios = ref<SdrRadio[]>([])
const menuStyle = ref<Record<string, string>>({})

// Armed at open time; scrolls within the settle window are the browser
// scrolling the focused trigger into view, not the user dismissing the menu.
let openedAtMs = 0

function positionMenu() {
  const el = dropdownRef.value
  // The device dropdown is always rendered, so its ref is populated when the
  // menu is toggled open.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  menuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

// The device listbox always has the placeholder (index 0) plus one option per
// online radio. The active-descendant id is clamped so it always references a
// rendered option (radios can load in after the menu opens).
const optionCount = computed(() => 1 + menuRadios.value.length)
function optionId(index: number): string {
  return `sdr-device-opt-${index}`
}
const activeDescId = computed(() =>
  menuOpen.value ? optionId(Math.min(highlight.value, optionCount.value - 1)) : undefined,
)

// List every enabled radio. We deliberately do NOT probe reachability here:
// rtl_tcp is single-client, so opening a throwaway probe socket to a radio (then
// closing it) disturbs the dongle and made the immediately-following control
// connect fail — the user had to select the radio twice before it connected.
// Reachability is shown by the device dot once a radio is selected and the real
// control connection is established; the menu just lists what's configured.
function populateMenuRadios() {
  menuRadios.value = sdrStore.radios.filter((radio) => radio.enabled)
}

function openMenu() {
  positionMenu()
  highlight.value = 0
  menuOpen.value = true
  openedAtMs = Date.now()
  populateMenuRadios()
}

function toggleMenu() {
  if (menuOpen.value) {
    closeMenu()
    return
  }
  openMenu()
}

function closeMenu() {
  menuOpen.value = false
}

function pickRadio(radio: SdrRadio | null) {
  closeMenu()
  emit('select', radio)
}

function selectHighlightedRadio() {
  const index = highlight.value
  // `index` is clamped to 0..menuRadios.length by the key handler, so a non-zero
  // index always resolves to a radio.
  pickRadio(index === 0 ? null : menuRadios.value[index - 1]!)
}

function onDropdownKey(e: KeyboardEvent) {
  if (!menuOpen.value) {
    // Closed: Enter/Space/Arrow keys open the listbox.
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu()
    }
    return
  }
  // Open: arrow keys move the highlight, Enter/Space selects, Escape/Tab close.
  const count = optionCount.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlight.value = (highlight.value + 1) % count
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlight.value = (highlight.value - 1 + count) % count
  } else if (e.key === 'Home') {
    e.preventDefault()
    highlight.value = 0
  } else if (e.key === 'End') {
    e.preventDefault()
    highlight.value = count - 1
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    selectHighlightedRadio()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeMenu()
  } else if (e.key === 'Tab') {
    closeMenu()
  }
}

function closeOnScroll() {
  if (Date.now() - openedAtMs < MENU_OPEN_SETTLE_MS) return
  closeMenu()
}

useDocumentEvent('click', closeMenu)
// Capture phase so scrolls from the inner side-panel container (a descendant,
// and scroll doesn't bubble) still reach this handler and dismiss the menu.
useDocumentEvent('scroll', closeOnScroll, { capture: true })
useWindowEvent('resize', closeMenu)
</script>
