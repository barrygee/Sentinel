import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import {
  FakeJsonCodeEditor,
  fakeJsonCodeEditorFormat,
} from '@sentinel/shell-api/testing/fakeJsonCodeEditor'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import ConfigInlineEditor from './ConfigInlineEditor.vue'

vi.mock('../../api/sdrManagerLocalApi')

const CONFIG = {
  version: 1,
  devices: [{ device_id: 'usb:1-1', name: 'Roof' }],
  hotspot: { ssid: 'field' },
}
const IMPORTED = { devices_applied: 1, devices_skipped: 0, hotspot_applied: false }

const mounted: VueWrapper[] = []
function mountEditor(): VueWrapper {
  const wrapper = mount(ConfigInlineEditor, {
    global: { stubs: { JsonCodeEditor: FakeJsonCodeEditor } },
  })
  mounted.push(wrapper)
  return wrapper
}

function button(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((candidate) => candidate.text() === text)
}

async function openEditor(): Promise<VueWrapper> {
  const wrapper = mountEditor()
  await button(wrapper, 'EDIT')!.trigger('click')
  await flushPromises()
  return wrapper
}

/** Type `config` into the editor and return what it staged for APPLY CHANGES. */
async function stageEdit(wrapper: VueWrapper, text: string): Promise<() => Promise<void>> {
  await wrapper.get('textarea').setValue(text)
  const staged = wrapper.emitted('stage')!
  return staged.at(-1)![0] as () => Promise<void>
}

describe('ConfigInlineEditor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    vi.mocked(api.getConfig).mockResolvedValue(structuredClone(CONFIG))
    vi.mocked(api.importConfig).mockResolvedValue(IMPORTED as never)
    vi.mocked(api.getAuthState).mockRejectedValue(new Error('not under test'))
    vi.mocked(api.listDevices).mockRejectedValue(new Error('not under test'))
    fakeJsonCodeEditorFormat.mockClear()
  })
  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
  })

  it('starts folded: only EDIT, nothing read yet', () => {
    const wrapper = mountEditor()
    expect(wrapper.findAll('button').map((each) => each.text())).toEqual(['EDIT'])
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(api.getConfig).not.toHaveBeenCalled()
  })

  it('EDIT shows this machine’s configuration as formatted JSON, read when shown', async () => {
    const wrapper = await openEditor()
    expect(api.getConfig).toHaveBeenCalledTimes(1)
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      JSON.stringify(CONFIG, null, 2),
    )
    expect(wrapper.get('textarea').attributes('aria-label')).toBe(
      'Editable SDR Manager configuration JSON',
    )
    expect(button(wrapper, 'HIDE')).toBeDefined()
  })

  it('FORMAT tidies the JSON, and HIDE folds the editor away', async () => {
    const wrapper = await openEditor()
    await button(wrapper, 'FORMAT')!.trigger('click')
    expect(fakeJsonCodeEditorFormat).toHaveBeenCalledTimes(1)

    await button(wrapper, 'HIDE')!.trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(button(wrapper, 'FORMAT')).toBeUndefined()
  })

  it('stages an edit for APPLY CHANGES rather than applying it', async () => {
    const wrapper = await openEditor()
    await stageEdit(wrapper, JSON.stringify({ ...CONFIG, devices: [] }))
    expect(wrapper.emitted('stage')).toHaveLength(1)
    expect(api.importConfig).not.toHaveBeenCalled()
  })

  it('applies the devices but not an unchanged hotspot, then refreshes what depends on them', async () => {
    const wrapper = await openEditor()
    const devices = useLocalSdrStore()
    const auth = useLocalAuthStore()
    const announce = vi.spyOn(devices, 'announce')
    const refreshConstraints = vi.spyOn(devices, 'refreshConstraints').mockResolvedValue()
    const refreshAuth = vi.spyOn(auth, 'refresh').mockResolvedValue()
    const edited = { ...CONFIG, devices: [{ device_id: 'usb:1-1', name: 'Mast' }] }

    await (
      await stageEdit(wrapper, JSON.stringify(edited))
    )()

    expect(api.importConfig).toHaveBeenCalledWith({
      config: edited,
      apply_devices: true,
      apply_hotspot: false,
    })
    expect(announce).toHaveBeenCalledWith('Configuration applied: 1 applied.')
    expect(refreshConstraints).toHaveBeenCalled()
    expect(refreshAuth).toHaveBeenCalled()
    // Read again afterwards, as the host now has it.
    expect(api.getConfig).toHaveBeenCalledTimes(2)
  })

  it('applies the hotspot only when the edit changed it', async () => {
    const wrapper = await openEditor()
    const edited = { ...CONFIG, hotspot: { ssid: 'other' } }

    await (
      await stageEdit(wrapper, JSON.stringify(edited))
    )()

    expect(api.importConfig).toHaveBeenCalledWith(expect.objectContaining({ apply_hotspot: true }))
  })

  it('applies a hotspot added to a configuration that had none', async () => {
    vi.mocked(api.getConfig).mockResolvedValue({ version: 1, devices: [] })
    const wrapper = await openEditor()

    await (
      await stageEdit(wrapper, JSON.stringify({ version: 1, devices: [], hotspot: { ssid: 'x' } }))
    )()

    expect(api.importConfig).toHaveBeenCalledWith(expect.objectContaining({ apply_hotspot: true }))
  })

  it('with nothing read to compare against, applies a hotspot the edit gives and none it leaves out', async () => {
    vi.mocked(api.getConfig).mockRejectedValue(new TypeError('offline'))
    const wrapper = await openEditor()

    await (
      await stageEdit(wrapper, JSON.stringify({ devices: [] }))
    )()
    expect(api.importConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ apply_hotspot: false }),
    )
    await (
      await stageEdit(wrapper, JSON.stringify({ devices: [], hotspot: { ssid: 'x' } }))
    )()
    expect(api.importConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ apply_hotspot: true }),
    )
  })

  it('imports nothing from JSON that does not parse: the staged change throws', async () => {
    const wrapper = await openEditor()
    const apply = await stageEdit(wrapper, '{ not json')
    await expect(apply()).rejects.toThrow()
    expect(api.importConfig).not.toHaveBeenCalled()
  })

  it('keeps an unapplied edit when the editor is shown again', async () => {
    const wrapper = await openEditor()
    await stageEdit(wrapper, '{"edited": true}')
    await button(wrapper, 'HIDE')!.trigger('click')
    await button(wrapper, 'EDIT')!.trigger('click')
    await flushPromises()
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('{"edited": true}')
    expect(api.getConfig).toHaveBeenCalledTimes(1)
  })

  it('says why the configuration could not be read', async () => {
    vi.mocked(api.getConfig).mockRejectedValue(
      new SdrManagerApiError(401, 'unauthenticated', 'Sign in to continue.'),
    )
    const wrapper = await openEditor()
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
  })

  it('has no accessibility violations, folded or open', async () => {
    const wrapper = mountEditor()
    await expectNoAxeViolations(wrapper)
    await button(wrapper, 'EDIT')!.trigger('click')
    await flushPromises()
    await expectNoAxeViolations(wrapper)
  })
})
