import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrGroupsTab from './SdrGroupsTab.vue'
import { useSdrStore } from '@/stores/sdr'
import type { SdrFrequencyGroup } from '@/stores/sdr'

enableAutoUnmount(afterEach)

// ── Fetch double ──────────────────────────────────────────────────────────────
const fetchCalls: Array<{ url: string; opts?: RequestInit }> = []
let fetchOverride: ((url: string, opts?: RequestInit) => Promise<Response> | null) | null = null

function okResponse(): Promise<Response> {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as unknown as Response)
}

beforeEach(() => {
  setActivePinia(createPinia())
  fetchCalls.length = 0
  fetchOverride = null
  vi.stubGlobal('fetch', ((url: string, opts?: RequestInit) => {
    fetchCalls.push({ url, opts })
    return fetchOverride?.(url, opts) ?? okResponse()
  }) as unknown as typeof fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeGroup(overrides: Partial<SdrFrequencyGroup> = {}): SdrFrequencyGroup {
  return {
    id: 1,
    name: 'Airband',
    slug: 'airband',
    color: '#c8ff00',
    sort_order: 0,
    ...overrides,
  }
}

function mountTab(groups: SdrFrequencyGroup[] = [makeGroup()]): VueWrapper {
  const store = useSdrStore()
  store.groups = groups
  return mount(SdrGroupsTab, { attachTo: document.body })
}

function addRowInput(wrapper: VueWrapper) {
  return wrapper.find('.sdr-frequency-manager-group-add-row .sdr-panel-input')
}

function submitButton(wrapper: VueWrapper) {
  const buttons = wrapper.findAll('.sdr-frequency-manager-group-add-row button')
  return buttons[buttons.length - 1]
}

// =============================================================================
describe('SdrGroupsTab — rendering', () => {
  it('renders one pill per group, sorted case-insensitively by name', () => {
    const wrapper = mountTab([
      makeGroup({ id: 1, name: 'marine', slug: 'marine' }),
      makeGroup({ id: 2, name: 'Airband', slug: 'airband' }),
      makeGroup({ id: 3, name: 'PMR', slug: 'pmr' }),
    ])
    const names = wrapper.findAll('.sdr-group-pill-name').map((pill) => pill.text())
    expect(names).toEqual(['Airband', 'marine', 'PMR'])
  })

  it('shows ADD (no CANCEL) when not editing', () => {
    const wrapper = mountTab()
    const buttons = wrapper.findAll('.sdr-frequency-manager-group-add-row button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text()).toBe('ADD')
  })
})

// =============================================================================
describe('SdrGroupsTab — add', () => {
  it('POSTs a new group with trimmed name, next sort_order and default color, then clears and emits changed', async () => {
    const wrapper = mountTab([makeGroup(), makeGroup({ id: 2, name: 'Marine', slug: 'marine' })])
    await addRowInput(wrapper).setValue('  PMR  ')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    const post = fetchCalls.find(
      (call) => call.url === '/api/sdr/groups' && call.opts?.method === 'POST',
    )
    expect(post).toBeTruthy()
    expect(JSON.parse(String(post?.opts?.body))).toEqual({
      name: 'PMR',
      color: '#c8ff00',
      sort_order: 2,
    })
    expect((addRowInput(wrapper).element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('adds on Enter in the name input', async () => {
    const wrapper = mountTab()
    await addRowInput(wrapper).setValue('PMR')
    await addRowInput(wrapper).trigger('keydown.enter')
    await flushPromises()
    expect(
      fetchCalls.some((call) => call.url === '/api/sdr/groups' && call.opts?.method === 'POST'),
    ).toBe(true)
  })

  it('does not POST or emit for a blank name', async () => {
    const wrapper = mountTab()
    await addRowInput(wrapper).setValue('   ')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    expect(fetchCalls).toHaveLength(0)
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('keeps the typed name and does not emit when the POST is rejected (non-ok)', async () => {
    fetchOverride = () =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as unknown as Response)
    const wrapper = mountTab()
    await addRowInput(wrapper).setValue('PMR')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    expect((addRowInput(wrapper).element as HTMLInputElement).value).toBe('PMR')
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('swallows a network error on POST without emitting', async () => {
    fetchOverride = () => Promise.reject(new Error('offline'))
    const wrapper = mountTab()
    await addRowInput(wrapper).setValue('PMR')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('changed')).toBeUndefined()
  })
})

// =============================================================================
describe('SdrGroupsTab — rename', () => {
  it('prefills and focuses the input, and shows SAVE + CANCEL when editing starts', async () => {
    const wrapper = mountTab([makeGroup({ name: 'Airband' })])
    await wrapper.find('.sdr-group-pill-edit').trigger('click')
    await flushPromises()
    const input = addRowInput(wrapper)
    expect((input.element as HTMLInputElement).value).toBe('Airband')
    expect(document.activeElement).toBe(input.element)
    const buttons = wrapper.findAll('.sdr-frequency-manager-group-add-row button')
    expect(buttons.map((button) => button.text())).toEqual(['CANCEL', 'SAVE'])
  })

  it('PUTs the trimmed name preserving color/sort_order, resets the row and emits changed', async () => {
    const wrapper = mountTab([
      makeGroup({ id: 7, name: 'Airband', color: '#123456', sort_order: 3 }),
    ])
    await wrapper.find('.sdr-group-pill-edit').trigger('click')
    await addRowInput(wrapper).setValue('  Air Traffic  ')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    const put = fetchCalls.find(
      (call) => call.url === '/api/sdr/groups/7' && call.opts?.method === 'PUT',
    )
    expect(put).toBeTruthy()
    expect(JSON.parse(String(put?.opts?.body))).toEqual({
      name: 'Air Traffic',
      color: '#123456',
      sort_order: 3,
    })
    expect((addRowInput(wrapper).element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('.sdr-frequency-manager-group-add-row button')).toHaveLength(1)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('does not PUT or leave edit mode for a blank name while editing', async () => {
    const wrapper = mountTab()
    await wrapper.find('.sdr-group-pill-edit').trigger('click')
    await addRowInput(wrapper).setValue('   ')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    expect(fetchCalls).toHaveLength(0)
    expect(submitButton(wrapper).text()).toBe('SAVE')
  })

  it('cancels editing via the CANCEL button', async () => {
    const wrapper = mountTab()
    await wrapper.find('.sdr-group-pill-edit').trigger('click')
    await wrapper.findAll('.sdr-frequency-manager-group-add-row button')[0].trigger('click')
    expect((addRowInput(wrapper).element as HTMLInputElement).value).toBe('')
    expect(submitButton(wrapper).text()).toBe('ADD')
  })

  it('cancels editing with Escape', async () => {
    const wrapper = mountTab()
    await wrapper.find('.sdr-group-pill-edit').trigger('click')
    await addRowInput(wrapper).trigger('keydown.escape')
    expect((addRowInput(wrapper).element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('.sdr-frequency-manager-group-add-row button')).toHaveLength(1)
  })

  it('swallows a network error on PUT without leaving edit mode or emitting', async () => {
    fetchOverride = (url, opts) =>
      opts?.method === 'PUT' ? Promise.reject(new Error('offline')) : null
    const wrapper = mountTab()
    await wrapper.find('.sdr-group-pill-edit').trigger('click')
    await addRowInput(wrapper).setValue('Renamed')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    expect(submitButton(wrapper).text()).toBe('SAVE')
    expect(wrapper.emitted('changed')).toBeUndefined()
  })
})

// =============================================================================
describe('SdrGroupsTab — delete', () => {
  it('DELETEs the group and emits changed', async () => {
    const wrapper = mountTab([makeGroup({ id: 9 })])
    await wrapper.find('.sdr-group-pill-del').trigger('click')
    await flushPromises()
    expect(
      fetchCalls.some((call) => call.url === '/api/sdr/groups/9' && call.opts?.method === 'DELETE'),
    ).toBe(true)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('swallows a network error on DELETE without emitting', async () => {
    fetchOverride = () => Promise.reject(new Error('offline'))
    const wrapper = mountTab()
    await wrapper.find('.sdr-group-pill-del').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('changed')).toBeUndefined()
  })
})

// =============================================================================
describe('SdrGroupsTab — accessibility', () => {
  it('has no axe violations while listing groups and editing one', async () => {
    const wrapper = mountTab([makeGroup(), makeGroup({ id: 2, name: 'Marine', slug: 'marine' })])
    await wrapper.find('.sdr-group-pill-edit').trigger('click')
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
