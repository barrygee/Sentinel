/** The Monaco API, as `lazy/monacoEditor` exports it. */
export type MonacoApi = typeof import('monaco-editor/editor/editor.api')

let loading: Promise<MonacoApi> | null = null

/**
 * Loads the Monaco editor on first use and shares it afterwards. It is a few
 * megabytes, so it is only fetched when someone opens a JSON editor.
 */
export function loadMonaco(): Promise<MonacoApi> {
  // Relative on purpose: `lazy/` is not a shared module, so this resolves inside
  // the shell's build and Monaco becomes one chunk of the shell, never a remote's.
  loading ??= import('./lazy/monacoEditor').then((module) => module.monaco)
  return loading
}
