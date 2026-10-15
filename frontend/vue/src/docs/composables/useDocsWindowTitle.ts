import { watch, type Ref } from 'vue'

/**
 * Keeps `document.title` as `<title> · Docs · Sentinel`. It runs after render
 * (`flush: 'post'`) so it lands after App's own per-route title, which sets a
 * bare "SENTINEL — DOCS" first.
 */
export function useDocsWindowTitle(title: Readonly<Ref<string>>): void {
  watch(
    title,
    (current) => {
      document.title = `${current} · Docs · Sentinel`
    },
    { immediate: true, flush: 'post' },
  )
}
