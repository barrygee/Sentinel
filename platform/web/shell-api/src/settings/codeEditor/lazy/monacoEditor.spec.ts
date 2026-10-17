import { describe, expect, it, vi } from 'vitest'

class FakeEditorWorker {}
class FakeJsonWorker {}
const fakeEditorApi = { editor: { create: vi.fn() } }

vi.mock('monaco-editor/editor/editor.api', () => fakeEditorApi)
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({ default: FakeEditorWorker }))
vi.mock('monaco-editor/language/json/json.worker?worker', () => ({ default: FakeJsonWorker }))
vi.mock('monaco-editor/language/json/monaco.contribution', () => ({}))
vi.mock('monaco-editor/languages/features/json/jsonMode', () => ({}))

describe('lazy/monacoEditor', () => {
  it('exports the Monaco API and starts the JSON worker for JSON, the editor worker otherwise', async () => {
    const { monaco } = await import('./monacoEditor')
    expect(monaco).toMatchObject(fakeEditorApi)
    const environment = globalThis.MonacoEnvironment!
    expect(environment.getWorker!('1', 'json')).toBeInstanceOf(FakeJsonWorker)
    expect(environment.getWorker!('2', 'editorWorkerService')).toBeInstanceOf(FakeEditorWorker)
  })
})
