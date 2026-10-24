import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useDocsDeploymentStore } from '@sentinel/shell-api/stores/docsDeployment'
import LocalNotEnabledNotice from './LocalNotEnabledNotice.vue'

enableAutoUnmount(afterEach)

async function mountNotice(docsDeployed = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useDocsDeploymentStore().deployed = docsDeployed
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/docs/:docPath(.*)?', component: { render: () => null } },
    ],
  })
  await router.push('/')
  const wrapper = mount(LocalNotEnabledNotice, { global: { plugins: [router, pinia] } })
  await flushPromises()
  return wrapper
}

describe('LocalNotEnabledNotice', () => {
  it('says why there is no THIS MACHINE group and how to switch it on', async () => {
    const wrapper = await mountNotice()
    expect(wrapper.get('h4').text()).toBe('THIS MACHINE')
    const text = wrapper.text()
    expect(text).toContain('isn’t running')
    expect(text).toContain('sdr-manager-local')
    expect(text).toContain('COMPOSE_PROFILES')
    expect(text).toContain('docker compose up -d')
  })

  it('is a landmark named by its heading', async () => {
    const wrapper = await mountNotice()
    const heading = wrapper.get('h4')
    expect(wrapper.get('aside').attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })

  it('links to the ADR with a name that says what it is about', async () => {
    const wrapper = await mountNotice()
    const link = wrapper.get('a.doc-link')
    expect(link.attributes('href')).toBe('/docs/adr/0007-sdr-manager')
    expect(link.attributes('aria-label')).toBe('Learn more about SDR Manager for this machine')
  })

  it('drops the docs link when the docs service is not deployed', async () => {
    const wrapper = await mountNotice(false)
    expect(wrapper.find('a.doc-link').exists()).toBe(false)
    expect(wrapper.text()).toContain('THIS MACHINE')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountNotice()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
