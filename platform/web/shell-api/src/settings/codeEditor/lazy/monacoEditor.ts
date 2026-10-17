// The `?worker` declarations must come with this file into every program that
// type-checks it (the SPA includes it through the package, not by glob), and a
// declaration file can only be pulled in by reference.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../workerImports.d.ts" />
/**
 * The Monaco editor with the JSON language and its workers.
 *
 * `jsonMode` is imported here, up front, on purpose. Monaco's JSON support
 * normally loads it lazily once a JSON model exists, and it brings most of the
 * editor's features with it (hover, CodeLens, suggest…). Their services must be
 * registered before the first editor is created: registered later, they are
 * never seen, and moving the mouse over the editor throws "depends on UNKNOWN
 * service ICodeLensCache". `JsonCodeEditor` switches off the features beyond
 * the basics through its options.
 *
 * Loaded only by `loadMonaco()`, with a dynamic import, so none of it is in the
 * app's startup bundle; it lives under `lazy/` so the shell's shared-module
 * list skips it too (`sharedPackageModuleSpecifiers`).
 */
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/language/json/monaco.contribution'
import 'monaco-editor/languages/features/json/jsonMode'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'

// Bundled workers (served from the app like any other asset, so they work off
// grid): the JSON one validates and formats, the generic one does the rest.
globalThis.MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) =>
    label === 'json' ? new JsonWorker() : new EditorWorker(),
}

export { monaco }
