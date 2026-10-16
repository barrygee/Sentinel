/* eslint-disable vue/one-component-per-file -- the harness defines two tiny wrapper components on purpose */
import { defineComponent, h, type App, type Component } from 'vue'
import { afterEach } from 'vitest'
import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils'
import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type Router,
  type RouterHistory,
} from 'vue-router'
import { DOCS_ROUTE_NAME } from '@/router/docsRoute'

// Everything this harness mounts is unmounted after each test, so components that
// listen on the document or window cannot hear the next test.
enableAutoUnmount(afterEach)

/** A route component that renders nothing, for routers that only need to exist. */
const EmptyView = defineComponent({ render: () => null })

/**
 * A router with the app's docs route plus a couple of section-like routes,
 * enough for the docs composables and components to run for real (real
 * `useRoute`/`useRouter`/`RouterLink`) without the whole section registry.
 *
 * @param history Memory history by default; pass `createWebHistory()` where the
 *   spec depends on `window.history.state` (closing the docs page does).
 */
export function createDocsTestRouter(history: RouterHistory = createMemoryHistory()): Router {
  return createRouter({
    history,
    routes: [
      { path: '/', component: EmptyView },
      { path: '/air/', component: EmptyView },
      { path: '/settings/:section?', name: 'settings', component: EmptyView },
      { path: '/docs/:docPath(.*)?', name: DOCS_ROUTE_NAME, component: EmptyView },
      { path: '/:pathMatch(.*)*', component: EmptyView },
    ],
  })
}

/** Same routes on the browser history of the jsdom window. */
export function createDocsTestWebRouter(): Router {
  return createDocsTestRouter(createWebHistory())
}

/**
 * Runs a composable inside a real component (so lifecycle hooks, `inject` and
 * the router work) and hands back what it returned.
 *
 * @param useComposable The composable call, made inside `setup()`.
 * @param plugins Plugins to install on the app, e.g. a router or pinia.
 * @returns The composable's result plus the wrapper, to unmount or inspect.
 */
export function mountComposable<Result>(
  useComposable: () => Result,
  plugins: Array<Parameters<App['use']>[0]> = [],
): { result: Result; wrapper: VueWrapper } {
  let result: Result | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useComposable()
        return () => h('div')
      },
    }),
    { global: { plugins }, attachTo: document.body },
  )
  return { result: result as Result, wrapper }
}

/**
 * Mounts a component with a real router (and optionally pinia) installed,
 * already navigated to `url`, so `RouterLink`, `useRoute` and `useRouter` work.
 *
 * @param component The component under test.
 * @param options Mount options (props, slots...) plus `url` and extra `plugins`.
 */
export async function mountWithRouter(
  component: Component,
  options: {
    url?: string
    props?: Record<string, unknown>
    slots?: Record<string, string>
    plugins?: Array<Parameters<App['use']>[0]>
    attachTo?: HTMLElement
  } = {},
): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createDocsTestRouter()
  await router.push(options.url ?? '/docs/')
  const wrapper = mount(component, {
    props: options.props,
    slots: options.slots,
    attachTo: options.attachTo ?? document.body,
    global: { plugins: [router, ...(options.plugins ?? [])] },
  })
  return { wrapper, router }
}
