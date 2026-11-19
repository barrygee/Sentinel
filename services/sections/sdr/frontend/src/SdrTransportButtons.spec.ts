import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrTransportButtons from './SdrTransportButtons.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

interface TransportProps {
  tuneDisabled?: boolean
  idle?: boolean
  isRecording?: boolean
  recSquelchOpen?: boolean
}

function mountTransport(props: TransportProps = {}) {
  return mount(SdrTransportButtons, {
    props: {
      tuneDisabled: props.tuneDisabled ?? false,
      idle: props.idle ?? false,
      isRecording: props.isRecording ?? false,
      recSquelchOpen: props.recSquelchOpen ?? false,
    },
    attachTo: document.body,
  })
}

function buttonNamed(wrapper: ReturnType<typeof mountTransport>, accessibleName: string) {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.attributes('aria-label') === accessibleName)
  if (!button) throw new Error(`no button named ${accessibleName}`)
  return button
}

describe('SdrTransportButtons — events', () => {
  it.each([
    ['Tune', 'tune'],
    ['Stop audio', 'stop'],
    ['Record', 'toggleRecording'],
  ])('the %s button emits %s', async (accessibleName, eventName) => {
    const wrapper = mountTransport()
    await buttonNamed(wrapper, accessibleName).trigger('click')
    expect(wrapper.emitted(eventName)).toHaveLength(1)
  })
})

describe('SdrTransportButtons — disabled states', () => {
  it('disables only Tune when tuneDisabled', () => {
    const wrapper = mountTransport({ tuneDisabled: true })
    expect(buttonNamed(wrapper, 'Tune').attributes('disabled')).toBeDefined()
    expect(buttonNamed(wrapper, 'Stop audio').attributes('disabled')).toBeUndefined()
    expect(buttonNamed(wrapper, 'Record').attributes('disabled')).toBeUndefined()
  })

  it('disables Stop and Record, not Tune, while idle', () => {
    const wrapper = mountTransport({ idle: true })
    expect(buttonNamed(wrapper, 'Tune').attributes('disabled')).toBeUndefined()
    expect(buttonNamed(wrapper, 'Stop audio').attributes('disabled')).toBeDefined()
    expect(buttonNamed(wrapper, 'Record').attributes('disabled')).toBeDefined()
  })
})

describe('SdrTransportButtons — record button states', () => {
  it('offers to record with a circle while not recording', () => {
    const record = buttonNamed(mountTransport(), 'Record')
    expect(record.attributes('title')).toBe('Record')
    expect(record.attributes('aria-pressed')).toBe('false')
    expect(record.classes()).not.toContain('sdr-rec-btn--active')
    expect(record.classes()).not.toContain('sdr-rec-btn--waiting')
    expect(record.find('circle').exists()).toBe(true)
  })

  it('shows a stop square while capturing with the squelch open', () => {
    const record = buttonNamed(
      mountTransport({ isRecording: true, recSquelchOpen: true }),
      'Stop recording',
    )
    expect(record.attributes('title')).toBe('Stop recording')
    expect(record.attributes('aria-pressed')).toBe('true')
    expect(record.classes()).toContain('sdr-rec-btn--active')
    expect(record.classes()).not.toContain('sdr-rec-btn--waiting')
    expect(record.findAll('rect')).toHaveLength(1)
  })

  it('shows a pause glyph and the waiting title while the squelch is shut', () => {
    const record = buttonNamed(
      mountTransport({ isRecording: true, recSquelchOpen: false }),
      'Stop recording',
    )
    expect(record.attributes('title')).toBe('Stop recording (waiting for signal)')
    expect(record.classes()).toContain('sdr-rec-btn--active')
    expect(record.classes()).toContain('sdr-rec-btn--waiting')
    expect(record.findAll('rect')).toHaveLength(2)
  })

  it('never shows the waiting state when not recording, whatever the squelch', () => {
    const record = buttonNamed(
      mountTransport({ isRecording: false, recSquelchOpen: true }),
      'Record',
    )
    expect(record.classes()).not.toContain('sdr-rec-btn--waiting')
  })
})

describe('SdrTransportButtons — accessibility', () => {
  it('has no axe violations idle, recording and waiting', async () => {
    expect(await axe(mountTransport({ idle: true }).html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(
      await axe(mountTransport({ isRecording: true, recSquelchOpen: true }).html(), AXE_OPTIONS),
    ).toHaveNoViolations()
    expect(
      await axe(mountTransport({ isRecording: true }).html(), AXE_OPTIONS),
    ).toHaveNoViolations()
  })
})
