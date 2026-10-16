<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import { copyTextToClipboard } from './composables/useClipboardCopy'
import { useDocsStore } from './docsStore'

/**
 * A fenced code block: the language as a caption, a COPY button, and the code
 * in a keyboard-focusable, horizontally scrolling `<pre>` (long lines scroll
 * inside the block; they never widen the page).
 *
 * COPY says COPIED for two seconds and announces it. Where the browser will not
 * give the page the clipboard (plain-HTTP LAN addresses), it selects the code
 * instead, says SELECT AND COPY, and announces that, so the reader can press
 * the copy shortcut themselves.
 */
const props = defineProps<{
  code: string
  /** The fence's language, shown as the caption. Empty hides the caption. */
  language: string
}>()

type CopyState = 'idle' | 'copied' | 'select'

const FEEDBACK_MS = 2000
const docsStore = useDocsStore()
const preRef = ref<HTMLElement | null>(null)
const copyState = ref<CopyState>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined

function selectCode(): void {
  const codeElement = preRef.value
  const selection = window.getSelection()
  if (!codeElement || !selection) return
  const range = document.createRange()
  range.selectNodeContents(codeElement)
  selection.removeAllRanges()
  selection.addRange(range)
}

async function copyCode(): Promise<void> {
  const copied = await copyTextToClipboard(props.code)
  if (copied) {
    copyState.value = 'copied'
    docsStore.announce('Copied to clipboard')
  } else {
    selectCode()
    copyState.value = 'select'
    docsStore.announce('Code selected. Press Control or Command and C to copy.')
  }
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, FEEDBACK_MS)
}

onBeforeUnmount(() => clearTimeout(resetTimer))

const buttonText: Record<CopyState, string> = {
  idle: 'COPY',
  copied: 'COPIED',
  select: 'SELECT AND COPY',
}
</script>

<template>
  <figure class="doc-code">
    <div class="doc-code__bar">
      <span class="doc-code__language">{{ language || 'code' }}</span>
      <BaseButton class="doc-code__copy" variant="ghost" @click="copyCode">{{
        buttonText[copyState]
      }}</BaseButton>
    </div>
    <pre
      ref="preRef"
      tabindex="0"
      role="group"
      :aria-label="`${language || 'Code'} code`"
    ><code>{{ code }}</code></pre>
  </figure>
</template>

<style scoped>
.doc-code {
  max-width: 960px;
  margin: 0 0 18px;
  background: var(--surface);
}

.doc-code__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 8px 0 18px;
}

.doc-code__language {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-code__copy {
  --ba-ghost-height: 28px;
  --ba-ghost-padding: 0 12px;
  --ba-ghost-font-size: var(--settings-text-caption);
  --ba-ghost-radius: 0;
  --ba-ghost-bg: transparent;
  --ba-ghost-color: var(--ink);
  --ba-ghost-hover-color: var(--ink-strong);
  /* Instant colour change under reduced motion is handled by the global rule. */
  min-width: 44px;
}

.doc-code pre {
  margin: 0;
  padding: 8px 18px 14px;
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: var(--settings-text-value);
  line-height: 1.55;
  color: var(--ink-strong);
  /* No wrapping: a command copied from here must stay one line. */
  white-space: pre;
  tab-size: 4;
}

.doc-code pre code {
  font: inherit;
}
</style>
