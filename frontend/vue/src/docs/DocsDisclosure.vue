<script setup lang="ts">
import { ref, useId } from 'vue'
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'

/**
 * A button that opens and closes a region below it — but only on the screens
 * that need it. Wide enough, the button disappears and the region is simply
 * shown. It is how the page list collapses on a phone, with one set of keyboard
 * rules:
 * `aria-expanded`/`aria-controls`, and Escape closes it and hands focus back to
 * the button (instead of the page-wide Escape that would close Docs).
 */
defineProps<{
  /** The button's text. */
  label: string
  /** The width below which the region collapses behind the button. */
  collapseBelow: 'tablet' | 'wide'
}>()

const open = defineModel<boolean>('open', { default: false })
const regionId = useId()
const buttonRef = ref<HTMLButtonElement | null>(null)

function onEscape(event: KeyboardEvent): void {
  const button = buttonRef.value
  // Only while the button is actually shown does Escape mean "close me".
  if (!open.value || !button || getComputedStyle(button).display === 'none') return
  event.stopPropagation()
  open.value = false
  button.focus()
}
</script>

<template>
  <div
    class="doc-disclosure"
    :class="[`doc-disclosure--${collapseBelow}`, { 'doc-disclosure--open': open }]"
    @keydown.esc="onEscape"
  >
    <button
      ref="buttonRef"
      type="button"
      class="doc-disclosure__button"
      :aria-expanded="open"
      :aria-controls="regionId"
      @click="open = !open"
    >
      <span>{{ label }}</span>
      <ChevronIcon :open="open" />
    </button>
    <div :id="regionId" class="doc-disclosure__region">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.doc-disclosure__button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 10px 16px;
  background: var(--surface);
  border: none;
  cursor: pointer;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-align: left;
  color: var(--ink-strong);
}

.doc-disclosure__region {
  display: none;
}

.doc-disclosure--open .doc-disclosure__region {
  display: block;
}

/* Wide enough, there is nothing to collapse: no button, region always shown. */
@media (min-width: 769px) {
  .doc-disclosure--tablet .doc-disclosure__button {
    display: none;
  }
  .doc-disclosure--tablet .doc-disclosure__region {
    display: block;
  }
}

@media (min-width: 1280px) {
  .doc-disclosure--wide .doc-disclosure__button {
    display: none;
  }
  .doc-disclosure--wide .doc-disclosure__region {
    display: block;
  }
}
</style>
