<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { editor as MonacoEditorNamespace } from 'monaco-editor/editor/editor.api'
import { loadMonaco } from '@sentinel/shell-api/settings/codeEditor/loadMonaco'
import {
  SENTINEL_EDITOR_THEME,
  defineSentinelTheme,
} from '@sentinel/shell-api/settings/codeEditor/editorTheme'

/**
 * A JSON code editor (Monaco) in the app's own colours and type: line numbers,
 * auto-indent, Tab / Shift+Tab to indent and outdent, Shift+Alt+F (or
 * {@link format}) to format, bracket matching, folding (opening folded to its top-level sections) and JSON errors marked
 * in place. Monaco loads on first use, so the editor shows a short loading
 * line until it arrives.
 *
 * `v-model` carries the text; only the user's edits emit, not the text the
 * parent sets.
 */
const props = defineProps<{
  /** The JSON text. */
  modelValue: string
  /** The editor's accessible name, e.g. "Editable app configuration JSON". */
  accessibleName: string
}>()

const emit = defineEmits<{ 'update:modelValue': [text: string] }>()

const hostRef = ref<HTMLDivElement | null>(null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const editorInstance = shallowRef<MonacoEditorNamespace.IStandaloneCodeEditor | null>(null)

/**
 * Folds every second-level block, so a document opens as its top-level
 * sections (`"app": { … }`, `"air": { … }`…) and each opens on its own. Monaco's
 * fold actions wait for the folding ranges the JSON worker computes, so this
 * works straight after creating the editor or setting its text.
 */
function foldToSections(instance: MonacoEditorNamespace.IStandaloneCodeEditor): void {
  void instance.getAction('editor.foldLevel2')?.run()
}

/** The app's value size (Settings' `--settings-text-value`), so the code reads at the field's size. */
function fontSizeAt(host: HTMLElement): number {
  return parseFloat(getComputedStyle(host).getPropertyValue('--settings-text-value')) || 13
}

onMounted(async () => {
  try {
    const monaco = await loadMonaco()
    // Vue clears the ref on unmount: removed while Monaco loaded, build nothing.
    const host = hostRef.value
    if (!host) return
    defineSentinelTheme(monaco, host)
    const instance = monaco.editor.create(host, {
      value: props.modelValue,
      language: 'json',
      theme: SENTINEL_EDITOR_THEME,
      ariaLabel: props.accessibleName,
      automaticLayout: true,
      fontFamily: getComputedStyle(host).fontFamily,
      fontSize: fontSizeAt(host),
      lineHeight: 1.6,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: false,
      formatOnPaste: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      renderLineHighlight: 'line',
      // Monaco's own rainbow brackets would bring colours the app doesn't use.
      bracketPairColorization: { enabled: false },
      guides: { bracketPairs: false, indentation: true },
      showFoldingControls: 'mouseover',
      // Basics only: no pop-up suggestions, CodeLens, colour swatches, links or
      // light-bulb fixes (Monaco's JSON support loads them all).
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: 'off',
      parameterHints: { enabled: false },
      codeLens: false,
      colorDecorators: false,
      links: false,
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
      inlayHints: { enabled: 'off' },
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      contextmenu: false,
      stickyScroll: { enabled: false },
      fixedOverflowWidgets: true,
      padding: { top: 16, bottom: 16 },
      scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    })
    // A flush is the parent's own text arriving via setValue, not an edit.
    instance.onDidChangeModelContent((change) => {
      if (!change.isFlush) emit('update:modelValue', instance.getValue())
    })
    foldToSections(instance)
    editorInstance.value = instance
    status.value = 'ready'
  } catch {
    status.value = 'failed'
  }
})

// The parent reloaded the text (panel reopened, file changed): show it.
watch(
  () => props.modelValue,
  (text) => {
    const instance = editorInstance.value
    if (instance && instance.getValue() !== text) {
      instance.setValue(text)
      foldToSections(instance)
    }
  },
)

onBeforeUnmount(() => {
  editorInstance.value?.getModel()?.dispose()
  editorInstance.value?.dispose()
})

/** Formats the whole document (two-space JSON); a no-op until the editor has loaded. */
async function format(): Promise<void> {
  await editorInstance.value?.getAction('editor.action.formatDocument')?.run()
}

defineExpose({ format })
</script>

<template>
  <!-- Escape belongs to the editor (it closes Monaco's find box and hovers), so
       it must not also reach Settings and close the panel over an unsaved edit. -->
  <div class="json-code-editor" @keydown.esc.stop>
    <div
      ref="hostRef"
      class="json-code-editor__host"
      :class="{ 'json-code-editor__host--ready': status === 'ready' }"
    />
    <p v-if="status === 'loading'" class="json-code-editor__status" role="status">
      Loading editor…
    </p>
    <p v-else-if="status === 'failed'" class="json-code-editor__status" role="alert">
      The editor couldn't load. Reload the page to try again.
    </p>
    <p v-else class="json-code-editor__hint">
      Tab indents. To move on with Tab, press Ctrl+M first (Ctrl+Shift+M on a Mac).
    </p>
  </div>
</template>

<style scoped>
/* Sits where the plain JSON field was: the field's grey, no border, and the
   accent underline when focused (outside the box: Monaco paints over an inset one). */
.json-code-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.json-code-editor__host {
  width: 100%;
  height: 520px;
  background: var(--surface);
  font-family: 'Barlow Condensed', 'Barlow', monospace;
  letter-spacing: 0.02em;
}

.json-code-editor__host:not(.json-code-editor__host--ready) {
  display: none;
}

.json-code-editor__host:focus-within {
  box-shadow: 0 2px 0 var(--color-accent);
}

.json-code-editor__status,
.json-code-editor__hint {
  margin: 0;
  font-size: var(--settings-text-small);
  color: var(--ink-secondary, rgba(var(--ink-rgb), 0.62));
}
</style>
