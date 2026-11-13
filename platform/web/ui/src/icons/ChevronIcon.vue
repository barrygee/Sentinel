<template>
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    class="chevron-icon"
    :class="{ 'chevron-icon--open': open === true, 'chevron-icon--closed': open === false }"
  >
    <path
      d="M2 3.5L5 6.5L8 3.5"
      stroke="currentColor"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * `ChevronIcon` — the disclosure arrow. Given `open`, it points the way every
 * disclosure in Sentinel does: right while closed, down while open. Without
 * `open` it just points down, for callers that turn a wrapper themselves.
 */
withDefaults(
  defineProps<{
    /** Whether what it discloses is showing; leave unset to point down unturned. */
    open?: boolean
    strokeWidth?: number
  }>(),
  // undefined, not Vue's implicit false for a missing Boolean prop: unset means
  // "the caller turns me", which is not the same as "closed".
  { open: undefined, strokeWidth: 1.3 },
)
</script>

<style>
.chevron-icon {
  display: block;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}
.chevron-icon--closed {
  transform: rotate(-90deg);
}
.chevron-icon--open {
  transform: rotate(0deg);
}
</style>
