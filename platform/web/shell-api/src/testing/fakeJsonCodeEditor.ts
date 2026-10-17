import { defineComponent, h } from 'vue'
import { vi } from 'vitest'

/**
 * Spec double for `JsonCodeEditor`: a plain textarea with the same `v-model`,
 * accessible name and exposed `format()`, so specs of the controls that host
 * the editor can type into it without loading Monaco (which jsdom can't run).
 *
 * Use as a stub: `mount(Control, { global: { stubs: { JsonCodeEditor: FakeJsonCodeEditor } } })`.
 * Every instance's `format()` is the one {@link fakeJsonCodeEditorFormat} spy.
 */
export const fakeJsonCodeEditorFormat = vi.fn()

export const FakeJsonCodeEditor = defineComponent({
  name: 'JsonCodeEditor',
  props: {
    modelValue: { type: String, required: true },
    accessibleName: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, expose }) {
    expose({ format: fakeJsonCodeEditorFormat })
    return () =>
      h('textarea', {
        class: 'fake-json-code-editor',
        'aria-label': props.accessibleName,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      })
  },
})
