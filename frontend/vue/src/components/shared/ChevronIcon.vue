<template>
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    class="chevron-icon"
    :class="{ 'chevron-icon--open': open }"
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
withDefaults(defineProps<{ open?: boolean; strokeWidth?: number }>(), { strokeWidth: 1.3 })
</script>

<style>
.chevron-icon {
  display: block;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}
.chevron-icon--open {
  transform: rotate(180deg);
}
</style>
