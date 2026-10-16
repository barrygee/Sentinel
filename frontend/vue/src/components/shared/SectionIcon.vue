<script setup lang="ts">
import RadioIcon from '@sentinel/ui/icons/RadioIcon.vue'

/**
 * The icon of one Settings section (App Settings, AIR, SPACE, SEA, LAND, SDR),
 * or `docs` for the Docs entry below them:
 * 24px grid, 1.8 strokes, `currentColor`. Shared by the Settings rail and the
 * docs rail, so a section looks the same in both. Any other key draws SDR's
 * radio (SDR's own `RadioIcon`). One root either way, so a class passed in
 * lands on the `<svg>`.
 */
defineProps<{
  /** `app`, or a section id. */
  sectionKey: string
}>()

/** Keys drawn inline here; anything else is SDR's shared radio glyph. */
const INLINE_ICON_KEYS: readonly string[] = ['app', 'air', 'space', 'sea', 'land', 'docs']
</script>

<template>
  <RadioIcon v-if="!INLINE_ICON_KEYS.includes(sectionKey)" />
  <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <!-- App Settings: sliders icon -->
    <template v-if="sectionKey === 'app'">
      <line
        x1="4"
        y1="6"
        x2="20"
        y2="6"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <circle cx="15" cy="6" r="2.5" stroke="currentColor" stroke-width="1.8" />
      <line
        x1="4"
        y1="13"
        x2="20"
        y2="13"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <circle cx="9" cy="13" r="2.5" stroke="currentColor" stroke-width="1.8" />
      <line
        x1="4"
        y1="20"
        x2="20"
        y2="20"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <circle cx="14" cy="20" r="2.5" stroke="currentColor" stroke-width="1.8" />
    </template>
    <!-- AIR: civil aircraft (matches AirSideMenu civil filter icon) -->
    <template v-else-if="sectionKey === 'air'">
      <path
        d="M12 2C12.8 2 13.2 3.6 13.2 6.6 L21 11.5 V13.4 L13.2 11 V16.5 L15.5 18.5 V20 L12 19 L8.5 20 V18.5 L10.8 16.5 V11 L3 13.4 V11.5 L10.8 6.6 C10.8 3.6 11.2 2 12 2Z"
        fill="currentColor"
      />
    </template>
    <!-- SPACE: planet Earth (globe with meridian and equator) -->
    <template v-else-if="sectionKey === 'space'">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" stroke-width="1.8" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.8" />
    </template>
    <!-- SEA: sailboat icon -->
    <template v-else-if="sectionKey === 'sea'">
      <line
        x1="12"
        y1="16"
        x2="12"
        y2="3"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <path d="M12 4L5 15h7V4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M3 16h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path
        d="M3 16l1.5 4.5h15L21 16"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
    <!-- LAND: mountain terrain icon -->
    <template v-else-if="sectionKey === 'land'">
      <path
        d="M2 20L8 7l4 6.5L16 5l6 15H2z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </template>
    <!-- Docs: an open book -->
    <template v-else-if="sectionKey === 'docs'">
      <path
        d="M12 6.5C10.4 5 7.6 4.5 4 4.5v13c3.6 0 6.4.5 8 2 1.6-1.5 4.4-2 8-2v-13c-3.6 0-6.4.5-8 2z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <line
        x1="12"
        y1="6.5"
        x2="12"
        y2="19.5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </template>
  </svg>
</template>
