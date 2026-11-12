<template>
  <BaseSelectMenu
    ref="selectMenuRef"
    :loading="loading"
    trigger-role="combobox"
    aria-label="Radio device"
    aria-controls="sdr-device-listbox"
    aria-owns="sdr-device-listbox"
    :aria-activedescendant="activeDescId"
    custom-keyboard
    @trigger-keydown="onDropdownKey"
    @open="onMenuOpen"
  >
    <template #selected>
      <div
        class="sdr-conn-dot"
        :class="connected ? 'sdr-dot-on' : 'sdr-dot-off'"
        :title="connected ? 'CONNECTED' : 'DISCONNECTED'"
      ></div>
      <span
        class="base-select-menu-text"
        :class="{
          'base-select-menu-text--chosen': selectedRadioId !== null,
          'sdr-device-text--readonly': readOnly,
        }"
        >{{ label }}</span
      >
      <!-- Padlock shown when another Sentinel controls the shared tuner;
           decorative here (the sr-only status below announces the state). -->
      <PadlockIcon v-if="readOnly" class="sdr-device-lock" />
    </template>
    <template #options>
      <div id="sdr-device-listbox" role="listbox" aria-label="Available radios">
        <div
          :id="optionId(0)"
          role="option"
          class="base-select-menu-option base-select-menu-placeholder"
          :class="{ 'base-select-menu-option--active': highlight === 0 }"
          :aria-selected="highlight === 0"
          @click="pickRadio(null)"
          @mousemove="highlight = 0"
        >
          — select radio —
        </div>
        <div
          v-for="(radio, index) in menuRadios"
          :id="optionId(index + 1)"
          :key="radio.id"
          role="option"
          class="base-select-menu-option"
          :class="{
            'base-select-menu-option--active': highlight === index + 1,
            'sdr-device-option--readonly': isRadioReadOnly(radio),
            'base-select-menu-option--unavailable': reservationFor(radio) !== null,
          }"
          :aria-selected="highlight === index + 1"
          :aria-disabled="reservationFor(radio) !== null"
          @click="pickRadio(radio)"
          @mousemove="highlight = index + 1"
        >
          <span class="base-select-menu-option-label"
            >{{ radio.name
            }}<span class="base-select-menu-option-detail">{{
              reservationFor(radio) ? `RESERVED · ${reservationFor(radio)} RECEIVER` : radio.host
            }}</span></span
          >
          <!-- Padlock: this radio is controlled by another Sentinel, or is
               reserved as a domain receiver. Only the connected radio's remote
               lock is known, so only its row is marked for that case. -->
          <PadlockIcon
            v-if="isRadioReadOnly(radio) || reservationFor(radio) !== null"
            class="sdr-device-lock sdr-device-option-lock"
          />
        </div>
      </div>
      <!-- Non-selectable status note lives outside the listbox. -->
      <div
        v-if="menuRadios.length === 0"
        class="base-select-menu-option base-select-menu-placeholder"
      >
        no radios configured
      </div>
    </template>
  </BaseSelectMenu>
  <span v-if="readOnly" class="sr-only" role="status"
    >Another Sentinel is controlling this radio</span
  >
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
 * The trigger, teleported menu and dismiss behaviour (outside click,
 * settle-window scroll, resize) come from BaseSelectMenu; this component
 * opts out of the default keyboard model (`custom-keyboard`) and adds the
 * listbox highlight/keyboard model on top, driving the exposed menu
 * controls. The `open` event is the open-time hook — every open path (click
 * or keyboard) resets the highlight and re-reads the store there. The
 * connection-dot family (`.sdr-conn-dot`, `.sdr-dot-off/-on`) and the
 * padlock (`.sdr-device-lock`) are styled by the unscoped block below; the
 * dropdown chrome and the generic option classes live with BaseSelectMenu.
 * `sdr-device-text--readonly` and `sdr-device-option--readonly` are unstyled
 * state hooks for specs.
 */
import { ref, computed } from 'vue'
import BaseSelectMenu from '@sentinel/ui/base/BaseSelectMenu.vue'
import PadlockIcon from '@sentinel/ui/icons/PadlockIcon.vue'
import { useSdrStore } from './stores/sdr'
import type { SdrRadio } from './stores/sdr'

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

/**
 * Which domain has reserved a radio ('APRS' / 'ADS-B'), or null when it is free.
 *
 * A reserved radio is doing a job for another domain — holding a decode bridge,
 * or tuned to 1090 MHz for AIR — so it is listed but not selectable here, with
 * the reason on the row. Retuning it from the panel would silently break that
 * domain; the way to get it back is to deselect it in Settings.
 */
function reservationFor(radio: SdrRadio): string | null {
  return sdrStore.radioReservation(radio.id)
}

const selectMenuRef = ref<InstanceType<typeof BaseSelectMenu> | null>(null)
// Mirrors the base menu's open state reactively (null before first render).
const menuOpen = computed(() => selectMenuRef.value?.menuOpen ?? false)
// 0 = the "select radio" placeholder, 1..N = menuRadios[index-1].
const highlight = ref(0)
const menuRadios = ref<SdrRadio[]>([])

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

// List every enabled, non-private radio. We deliberately do NOT probe
// reachability here: rtl_tcp is single-client, so opening a throwaway probe
// socket to a radio (then closing it) disturbs the dongle and made the
// immediately-following control connect fail — the user had to select the
// radio twice before it connected. Reachability is shown by the device dot
// once a radio is selected and the real control connection is established;
// the menu just lists what's configured. A `visibility: 'private'` device
// (ADR-0009) still runs and holds its port but is deliberately excluded from
// this operational list — it exists for another consumer, not this operator.
function populateMenuRadios() {
  menuRadios.value = sdrStore.radios.filter(
    (radio) => radio.enabled && radio.visibility !== 'private',
  )
}

// Runs on every open path (trigger click or keyboard) via the base's `open`
// event, before the menu body renders.
function onMenuOpen() {
  highlight.value = 0
  populateMenuRadios()
}

function pickRadio(radio: SdrRadio | null) {
  // A reserved row is inert: the menu stays open so the operator can pick
  // another radio, and the reason is already on the row they clicked.
  if (radio && reservationFor(radio) !== null) return
  // The options only render once the menu (and therefore the ref) exists.
  selectMenuRef.value!.closeMenu()
  emit('select', radio)
}

function selectHighlightedRadio() {
  const index = highlight.value
  // `index` is clamped to 0..menuRadios.length by the key handler, so a non-zero
  // index always resolves to a radio.
  pickRadio(index === 0 ? null : menuRadios.value[index - 1]!)
}

function onDropdownKey(e: KeyboardEvent) {
  // The trigger only fires events once mounted, so the ref is always set.
  const menu = selectMenuRef.value!
  if (!menuOpen.value) {
    // Closed: Enter/Space/Arrow keys open the listbox.
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      menu.openMenu()
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
    menu.closeMenu()
  } else if (e.key === 'Tab') {
    menu.closeMenu()
  }
}
</script>

<!-- Unscoped on purpose (B10 CSS co-location): the connection-dot family
     moved here verbatim from SdrPanel.css. Its rules and the padlock's share
     no declarations with BaseSelectMenu's sheet, so load order between the
     two blocks never decides a winner. -->
<style>
.sdr-conn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  transition:
    background 0.3s,
    box-shadow 0.3s;
}

.sdr-dot-off {
  background: rgba(var(--sev-error-rgb), 0.6);
}

.sdr-dot-on {
  background: var(--accent);
}

/* Another Sentinel controls the shared tuner: the red padlock signals this,
   in the trigger and on read-only menu rows (.sdr-device-option-lock), while
   the radio name keeps its normal colour so it stays easy to read. The
   read-only state is still announced via the sr-only status. */
.sdr-device-lock {
  flex-shrink: 0;
  display: block;
  color: var(--sev-error);
}
</style>
