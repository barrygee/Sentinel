<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import BaseSearchField from '@sentinel/ui/base/BaseSearchField.vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'

/**
 * The docs search box: a Settings-style field with the docs' own behaviour.
 * - Typing is debounced (150 ms) before it reaches the caller, so results do
 *   not flicker per keystroke.
 * - `/` focuses it from anywhere on the page, except while typing in a field.
 * - Enter searches immediately, even for text that was only pre-filled.
 * - Down-arrow hands focus to the first result.
 * - Escape clears the text; with nothing to clear it does nothing, and in
 *   either case the key never reaches the page-level "close docs" handler.
 */
const props = withDefaults(
  defineProps<{
    /** The committed query. */
    modelValue: string
    /** Whether `/` focuses this field. Only one field on a page should say yes. */
    shortcut?: boolean
    /** Whether the field is the page's search landmark (one per page). */
    landmark?: boolean
  }>(),
  { shortcut: true, landmark: true },
)

const emit = defineEmits<{
  'update:modelValue': [query: string]
  /** Down-arrow pressed: move focus to the first result. */
  'focus-results': []
}>()

const DEBOUNCE_MS = 150

const draft = ref(props.modelValue)
const fieldRef = ref<InstanceType<typeof BaseSearchField> | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | undefined

// An external change (Back to a past search, a cleared query) shows in the box.
watch(
  () => props.modelValue,
  (committed) => {
    if (committed !== draft.value) draft.value = committed
  },
)

/** Sends the typed text to the caller now; `force` sends it even if unchanged (Enter). */
function commitNow(force = false): void {
  clearTimeout(debounceTimer)
  if (force || draft.value !== props.modelValue) emit('update:modelValue', draft.value)
}

watch(draft, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => commitNow(), DEBOUNCE_MS)
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    if (draft.value !== '') {
      event.preventDefault()
      draft.value = ''
      commitNow()
    }
  } else if (event.key === 'Enter') {
    commitNow(true)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    commitNow()
    emit('focus-results')
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable]') !== null
  )
}

useDocumentEvent('keydown', (event: KeyboardEvent) => {
  if (!props.shortcut || event.key !== '/') return
  if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
  event.preventDefault()
  fieldRef.value?.focus()
})

onBeforeUnmount(() => clearTimeout(debounceTimer))

defineExpose({
  /** Moves focus into the field. */
  focus: (): void => fieldRef.value?.focus(),
  /** Selects the field's text. */
  select: (): void => fieldRef.value?.select(),
})
</script>

<template>
  <BaseSearchField
    ref="fieldRef"
    v-model="draft"
    class="doc-search-field"
    :landmark="landmark"
    label="Search the docs"
    placeholder="SEARCH DOCS"
    clear-label="Clear search"
    @keydown="onKeydown"
    @clear="commitNow()"
  />
</template>
