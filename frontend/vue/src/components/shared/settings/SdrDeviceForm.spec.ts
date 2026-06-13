import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrDeviceForm from './SdrDeviceForm.vue'

function stubFetch(ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const EXISTING = {
  id: 7,
  name: 'Roof',
  host: '192.168.1.50',
  port: 1234,
  bandwidth: 2048000,
  rf_gain: 30,
  agc: true,
  enabled: false,
  description: '',
}

describe('SdrDeviceForm', () => {
  beforeEach(() => {
    stubFetch(true)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('defaults a new form to enabled with AGC off', async () => {
    const wrapper = mount(SdrDeviceForm, { props: { radio: null } })
    await flushPromises()
    const [enabledBtn, disabledBtn] = wrapper.findAll('.sdr-devices-enabled-btn')
    expect(enabledBtn!.classes()).toContain('is-active')
    expect(disabledBtn!.classes()).not.toContain('is-active')
    expect((wrapper.find('.sdr-devices-agc-input').element as HTMLInputElement).checked).toBe(false)
  })

  it('prefills the form from an existing radio', async () => {
    const wrapper = mount(SdrDeviceForm, { props: { radio: EXISTING } })
    await flushPromises()
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('Roof')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('192.168.1.50')
    expect((wrapper.find('.sdr-devices-agc-input').element as HTMLInputElement).checked).toBe(true)
    // enabled === false → the DISABLED button is active.
    expect(wrapper.findAll('.sdr-devices-enabled-btn')[1]!.classes()).toContain('is-active')
  })

  it('emits cancel when CANCEL is clicked', async () => {
    const wrapper = mount(SdrDeviceForm, { props: { radio: null } })
    await flushPromises()
    await wrapper.find('.sdr-devices-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('requires a name and host before saving', async () => {
    const fetchMock = stubFetch(true)
    const wrapper = mount(SdrDeviceForm, { props: { radio: null } })
    await flushPromises()
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Name and IP address are required.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs a new radio with defaulted optional fields', async () => {
    const fetchMock = stubFetch(true)
    const wrapper = mount(SdrDeviceForm, { props: { radio: null } })
    await flushPromises()
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    await inputs[0]!.setValue('New SDR')
    await inputs[1]!.setValue('10.0.0.1')
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/sdr/radios')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toMatchObject({
      name: 'New SDR',
      host: '10.0.0.1',
      port: 1234,
      bandwidth: null,
      rf_gain: null,
      enabled: true,
    })
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('sends every field the user fills in on a new radio', async () => {
    const fetchMock = stubFetch(true)
    const wrapper = mount(SdrDeviceForm, { props: { radio: null } })
    await flushPromises()
    const inputs = wrapper.findAll('.sdr-devices-form-input')
    await inputs[0]!.setValue('Full SDR') // name
    await inputs[1]!.setValue('10.0.0.2') // host
    await inputs[2]!.setValue(5678) // port
    await inputs[3]!.setValue('1024000') // bandwidth
    await inputs[4]!.setValue('42') // rf gain
    await wrapper.find('.sdr-devices-agc-input').setValue(true)
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      name: 'Full SDR',
      host: '10.0.0.2',
      port: 5678,
      bandwidth: 1024000,
      rf_gain: 42,
      agc: true,
    })
  })

  it('PUTs an existing radio to its id endpoint', async () => {
    const fetchMock = stubFetch(true)
    const wrapper = mount(SdrDeviceForm, { props: { radio: EXISTING } })
    await flushPromises()
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/sdr/radios/7')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toMatchObject({ port: 1234, bandwidth: 2048000, rf_gain: 30 })
  })

  it('shows a save-failed message on a non-ok response', async () => {
    stubFetch(false)
    const wrapper = mount(SdrDeviceForm, { props: { radio: EXISTING } })
    await flushPromises()
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Save failed.')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('shows a network-error message when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const wrapper = mount(SdrDeviceForm, { props: { radio: EXISTING } })
    await flushPromises()
    await wrapper.find('.sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-devices-form-error').text()).toBe('Network error.')
  })

  it('toggles the enabled/disabled status buttons', async () => {
    const wrapper = mount(SdrDeviceForm, { props: { radio: null } })
    await flushPromises()
    const [enabledBtn, disabledBtn] = wrapper.findAll('.sdr-devices-enabled-btn')
    await disabledBtn!.trigger('click')
    expect(disabledBtn!.classes()).toContain('is-active')
    await enabledBtn!.trigger('click')
    expect(enabledBtn!.classes()).toContain('is-active')
  })

  it('focuses the name field shortly after mount', async () => {
    vi.useFakeTimers()
    const wrapper = mount(SdrDeviceForm, { props: { radio: null }, attachTo: document.body })
    const nameInput = wrapper.findAll('.sdr-devices-form-input')[0]!.element as HTMLInputElement
    vi.runAllTimers()
    expect(document.activeElement).toBe(nameInput)
    wrapper.unmount()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SdrDeviceForm, { props: { radio: null } })
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
