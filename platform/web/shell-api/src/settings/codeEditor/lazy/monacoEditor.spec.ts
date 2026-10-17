import { describe, expect, it, vi } from 'vitest'

class FakeEditorWorker {}
class FakeJsonWorker {}
const fakeEditorApi = { editor: { create: vi.fn() } }

vi.mock('monaco-editor/editor/editor.api', () => fakeEditorApi)
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({ default: FakeEditorWorker }))
vi.mock('monaco-editor/language/json/json.worker?worker', () => ({ default: FakeJsonWorker }))
for (const sideEffectModule of [
  'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching',
  'monaco-editor/editor/contrib/clipboard/browser/clipboard',
  'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo',
  'monaco-editor/editor/contrib/find/browser/findController',
  'monaco-editor/editor/contrib/folding/browser/folding',
  'monaco-editor/editor/contrib/format/browser/formatActions',
  'monaco-editor/editor/contrib/gotoError/browser/gotoError',
  'monaco-editor/editor/contrib/hover/browser/hoverContribution',
  'monaco-editor/editor/contrib/indentation/browser/indentation',
  'monaco-editor/editor/contrib/linesOperations/browser/linesOperations',
  'monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode',
  'monaco-editor/editor/contrib/wordOperations/browser/wordOperations',
  'monaco-editor/language/json/monaco.contribution',
])
  vi.doMock(sideEffectModule, () => ({}))

describe('lazy/monacoEditor', () => {
  it('exports the Monaco API and starts the JSON worker for JSON, the editor worker otherwise', async () => {
    const { monaco } = await import('./monacoEditor')
    expect(monaco).toMatchObject(fakeEditorApi)
    const environment = globalThis.MonacoEnvironment!
    expect(environment.getWorker!('1', 'json')).toBeInstanceOf(FakeJsonWorker)
    expect(environment.getWorker!('2', 'editorWorkerService')).toBeInstanceOf(FakeEditorWorker)
  })
})
