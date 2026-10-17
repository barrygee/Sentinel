// The `?worker` declarations must come with this file into every program that
// type-checks it (the SPA includes it through the package, not by glob), and a
// declaration file can only be pulled in by reference.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../workerImports.d.ts" />
/**
 * The Monaco editor, trimmed to what Sentinel's JSON editors use: the editor
 * core plus line numbers, indenting, formatting, bracket matching, folding,
 * find, hovers (to read a JSON error) and the JSON language with its worker.
 *
 * Loaded only by `loadMonaco()`, with a dynamic import, so none of it is in the
 * app's startup bundle; it lives under `lazy/` so the shell's shared-module
 * list skips it too (`sharedPackageModuleSpecifiers`).
 */
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard'
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/folding/browser/folding'
import 'monaco-editor/editor/contrib/format/browser/formatActions'
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError'
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/editor/contrib/indentation/browser/indentation'
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations'
import 'monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode'
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations'
import 'monaco-editor/language/json/monaco.contribution'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'

// Bundled workers (served from the app like any other asset, so they work off
// grid): the JSON one validates and formats, the generic one does the rest.
globalThis.MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) =>
    label === 'json' ? new JsonWorker() : new EditorWorker(),
}

export { monaco }
