<script setup lang="ts">
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'

/**
 * `BaseIconLink` — the link twin of `BaseIconButton`: the same icon-rail look
 * and hover tooltip, rendered as `<a href>` for a rail entry that *navigates*
 * (so middle-click, open-in-new-tab and a visible URL work) rather than
 * toggling something, where `aria-pressed` would be the wrong semantics.
 *
 * It is router-agnostic: the app wraps it in `<RouterLink custom>` and wires
 * `navigate` to `click`. The current rail entry is marked with `current`
 * (`aria-current="true"`), not `aria-pressed`.
 */
withDefaults(
  defineProps<{
    href: string
    /** Accessible name — required because the link holds only an icon. */
    accessibleName: string
    /** Hover-tooltip text. */
    tooltip?: string
    /** Which side the tooltip opens on. Defaults to `'right'`. */
    tooltipSide?: 'left' | 'right'
    /** Draws the accent bar and tint of the current entry. */
    active?: boolean
    /** Marks the entry as current for assistive technology (`aria-current="true"`). */
    current?: boolean
    /** Rail look with the accent bar on the left edge. Defaults to `true`. */
    bordered?: boolean
  }>(),
  {
    tooltip: undefined,
    tooltipSide: 'right',
    active: false,
    current: false,
    bordered: true,
  },
)
</script>

<template>
  <BaseIconButton
    :href="href"
    :accessible-name="accessibleName"
    :tooltip="tooltip"
    :tooltip-side="tooltipSide"
    :active="active"
    :aria-current="current ? 'true' : undefined"
    :bordered="bordered"
  >
    <slot />
  </BaseIconButton>
</template>
