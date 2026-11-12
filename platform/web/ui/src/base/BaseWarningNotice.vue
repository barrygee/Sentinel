<template>
  <div class="warning-notice" role="status">
    <!-- GOV.UK Design System "Warning text": a filled circle carrying an
         exclamation mark, paired with visually-hidden wording so the warning
         is announced rather than left to the colour and glyph alone. -->
    <span class="warning-notice-icon" aria-hidden="true">!</span>
    <p class="warning-notice-message"><span class="sr-only">Warning: </span>{{ message }}</p>
    <div v-if="$slots.action" class="warning-notice-action"><slot name="action" /></div>
    <BaseIconAction
      v-if="dismissible"
      class="warning-notice-dismiss"
      accessible-name="Dismiss warning"
      @click="emit('dismiss')"
    >
      <CloseIcon :size="12" />
    </BaseIconAction>
  </div>
</template>

<script setup lang="ts">
/**
 * `BaseWarningNotice` — the yellow warning strip: a round "!" mark, the
 * message, and an optional action.
 *
 * Only as wide as its content (never wider than its container), so it reads as
 * a notice rather than a full-width band. Placement belongs to the caller:
 * `MapNoticeBanner` pins it over the map, the Settings panel sets it inline.
 *
 * `dismissible` adds a × button that emits `dismiss`; the caller decides what
 * dismissing means (and when the warning comes back), so the strip holds no
 * state of its own.
 */
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import CloseIcon from '@sentinel/ui/icons/CloseIcon.vue'

defineProps<{
  /** The warning to show. The caller renders nothing when there is none. */
  message: string
  /** Show a × button that emits `dismiss`. */
  dismissible?: boolean
}>()

const emit = defineEmits<{
  /** The operator closed the warning with the × button. */
  dismiss: []
}>()
</script>

<style scoped>
.warning-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  /* fit-content: as wide as the text needs, but never past the container. */
  width: fit-content;
  box-sizing: border-box;
  padding: 10px 14px;
  /* Square, matching the settings design language. */
  border-radius: 0;
  /* The warn fill rather than danger: nothing is broken and no data is lost —
     it is something the operator should know before acting. */
  background: var(--sev-warn);
  color: var(--accent-ink);
  font-size: 12.5px;
  line-height: 1.55;
}

.warning-notice-icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  /* The one round thing here, on purpose: GOV.UK's warning mark is a circle. */
  border-radius: 50%;
  background: var(--accent-ink);
  color: var(--sev-warn);
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  /* The glyph sits marginally high in the circle at this weight. */
  padding-bottom: 1px;
}

.warning-notice-message {
  margin: 0;
}

.warning-notice-action {
  flex-shrink: 0;
  /* Re-enabled for callers that make the notice itself click-through. */
  pointer-events: auto;
}

/* 28px square: past the 24px minimum target (WCAG 2.5.8), drawn in the strip's
   ink so it reads as part of the notice. */
.warning-notice-dismiss {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-right: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
  color: var(--accent-ink);
  cursor: pointer;
  /* Re-enabled for callers that make the notice itself click-through. */
  pointer-events: auto;
  transition: background 0.15s;
}

.warning-notice-dismiss:hover {
  background: rgba(var(--shadow-rgb), 0.12);
}

.warning-notice-dismiss:focus-visible {
  outline: 2px solid var(--accent-ink);
  outline-offset: -2px;
}
</style>
