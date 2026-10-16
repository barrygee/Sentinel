import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import { createRouter, createMemoryHistory } from 'vue-router'
import DocLink from './DocLink.vue'

enableAutoUnmount(afterEach)

async function mountLink(docPath: string, settingLabel: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/docs/:docPath(.*)?', name: 'doc', component: { render: () => null } },
    ],
  })
  await router.push('/')
  const wrapper = mount(DocLink, {
    props: { docPath, settingLabel },
    global: { plugins: [router] },
    attachTo: document.body,
  })
  return { wrapper, router }
}

describe('DocLink', () => {
  it('links to the docs page below /docs/ and names the setting in its accessible name', async () => {
    const { wrapper } = await mountLink('operations', 'Recordings folder')
    const link = wrapper.get('a.doc-link')
    expect(link.attributes('href')).toBe('/docs/operations')
    expect(link.attributes('aria-label')).toBe('Learn more about Recordings folder')
  })

  it('keeps an anchor in the path', async () => {
    const { wrapper } = await mountLink('operations#where-recordings-are-saved', 'Folder')
    expect(wrapper.get('a').attributes('href')).toBe('/docs/operations#where-recordings-are-saved')
  })

  it('shows LEARN MORE and hides the decorative chevron from assistive technology', async () => {
    const { wrapper } = await mountLink('operations', 'Folder')
    expect(wrapper.get('a').text()).toContain('LEARN MORE')
    expect(wrapper.get('a span').attributes('aria-hidden')).toBe('true')
  })

  it('navigates in-app (router push, no page load) when clicked', async () => {
    const { wrapper, router } = await mountLink('operations#where', 'Folder')
    await wrapper.get('a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/docs/operations')
    expect(router.currentRoute.value.hash).toBe('#where')
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountLink('operations', 'Folder')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
