<script setup lang="ts">
import { ref } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'

/**
 * `BaseSearchField` — the Settings-style search bar: a filled strip with a
 * magnifier, an uppercase placeholder and a clear (x) button that appears once
 * there is text. A real `type="search"` input inside a `role="search"` wrapper,
 * so it is announced as a search landmark (opt out with `landmark=false` for a
 * second field on the same page) with an accessible name on the input.
 *
 * It owns only the field's look and v-model; what searching *does* (debounce,
 * shortcuts, result handoff) stays with the caller, which can listen to the
 * native `keydown` that falls through to the input.
 */
const model = defineModel<string>({ required: true })

withDefaults(
  defineProps<{
    /** Accessible name of the input (the placeholder is not a name). */
    label: string
    /** `id` of the input, for callers whose CSS or tests address it. */
    inputId?: string
    /**
     * The input's type. `search` (the default) gives it the searchbox role;
     * Settings keeps `text`, which its specs and e2e tests address as a textbox.
     */
    inputType?: 'search' | 'text'
    /** `id` of the clear button, likewise. */
    clearId?: string
    /** Uppercase hint shown while empty. */
    placeholder?: string
    /** Accessible name of the clear button. Defaults to "Clear search". */
    clearLabel?: string
    /**
     * Whether the field is a search landmark. A page should have one primary
     * search landmark; a second field (e.g. in a "not found" body) passes false.
     */
    landmark?: boolean
  }>(),
  {
    inputId: undefined,
    inputType: 'search',
    clearId: undefined,
    placeholder: undefined,
    clearLabel: undefined,
    landmark: true,
  },
)

const emit = defineEmits<{ clear: [] }>()

const inputRef = ref<HTMLInputElement | null>(null)

/** Clears the text, tells the caller, and keeps focus in the field. */
function clear(): void {
  model.value = ''
  emit('clear')
  inputRef.value?.focus()
}

defineExpose({
  /** Moves focus into the input. */
  focus: (): void => inputRef.value?.focus(),
  /** Selects the current text. */
  select: (): void => inputRef.value?.select(),
  /** The input element, for callers that need to test where focus is. */
  input: inputRef,
})
</script>

<template>
  <div class="ba-search-field" :role="landmark ? 'search' : undefined">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" />
      <line
        x1="9.5"
        y1="9.5"
        x2="13"
        y2="13"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
    <input
      :id="inputId"
      ref="inputRef"
      v-model="model"
      class="ba-search-field__input"
      :type="inputType"
      :aria-label="label"
      :placeholder="placeholder"
      autocomplete="off"
      spellcheck="false"
    />
    <BaseIconAction
      v-if="model.length > 0"
      :id="clearId"
      class="ba-search-field__clear"
      :accessible-name="clearLabel ?? 'Clear search'"
      @click="clear"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <line
          x1="2"
          y1="2"
          x2="10"
          y2="10"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
        <line
          x1="10"
          y1="2"
          x2="2"
          y2="10"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </BaseIconAction>
  </div>
</template>

<style scoped>
.ba-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(var(--shadow-rgb), 0.025);
  padding: 8px 12px 8px 18px;
  min-height: 41px;
}

.ba-search-field svg {
  flex-shrink: 0;
  color: rgba(var(--ink-rgb), 0.62);
}

.ba-search-field__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--ink);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small, 11px);
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  caret-color: var(--ink-strong);
  /* Drop the browser's own clear glyph: the field draws its own. */
  appearance: none;
}

/* The strip draws the focus ring, not the input inside it (the app-wide ring is
   !important, so this must be too). */
.ba-search-field__input:focus-visible {
  outline: none !important;
}

.ba-search-field__input::-webkit-search-cancel-button {
  display: none;
}

.ba-search-field__input::placeholder {
  /* 4.5:1 against the filled strip: a placeholder is still read as text. */
  color: rgba(var(--ink-rgb), 0.62);
  letter-spacing: 0.14em;
}

/* The field has no outline of its own (the strip is the affordance), so the
   strip shows the focus ring instead — a 2px accent rule, as Settings fields do. */
.ba-search-field:focus-within {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.ba-search-field__clear {
  /* 24x24 target (WCAG 2.5.8) around the 12px glyph. */
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: rgba(var(--ink-rgb), 0.62);
  transition: color 0.15s;
}

.ba-search-field__clear:hover {
  color: var(--ink-strong);
}
</style>
