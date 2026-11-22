import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import PlaybackTransport from './PlaybackTransport.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountTransport(playing = false) {
  return mount(PlaybackTransport, {
    props: { playing, stepLabel: '1 minute' },
    attachTo: document.body,
  })
}

describe('PlaybackTransport', () => {
  it('is a named group of back, play and forward', () => {
    const wrapper = mountTransport()
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Replay transport')
    expect(wrapper.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      'Back 1 minute',
      'Play replay',
      'Forward 1 minute',
    ])
  })

  it('names the play button by what pressing it does', async () => {
    const wrapper = mountTransport(true)
    expect(wrapper.findAll('button')[1]!.attributes('aria-label')).toBe('Pause replay')
    expect(wrapper.findAll('button')[1]!.findAll('rect')).toHaveLength(2)
    await wrapper.setProps({ playing: false })
    expect(wrapper.findAll('button')[1]!.attributes('aria-label')).toBe('Play replay')
  })

  it('emits one event per button', async () => {
    const wrapper = mountTransport()
    const [back, play, forward] = wrapper.findAll('button')
    await back!.trigger('click')
    await play!.trigger('click')
    await forward!.trigger('click')
    expect(Object.keys(wrapper.emitted())).toEqual(
      expect.arrayContaining(['stepBack', 'togglePlaying', 'stepForward']),
    )
    expect(wrapper.emitted('stepBack')).toHaveLength(1)
    expect(wrapper.emitted('togglePlaying')).toHaveLength(1)
    expect(wrapper.emitted('stepForward')).toHaveLength(1)
  })

  it('has no axe violations', async () => {
    expect(await axe(mountTransport().html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
