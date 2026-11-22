import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ReplayTransport from './ReplayTransport.vue'

enableAutoUnmount(afterEach)

function mountTransport(playing = false, replaying = true) {
  return mount(ReplayTransport, {
    props: { playing, replaying, stepLabel: '1 minute' },
    attachTo: document.body,
  })
}

describe('ReplayTransport', () => {
  it('is a named group of chip buttons: back, play, forward, LIVE', () => {
    const wrapper = mountTransport()
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Replay transport')
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual([
      'Back 1 minute',
      'Play replay',
      'Forward 1 minute',
      'Back to live',
    ])
    expect(buttons.every((button) => button.classes().includes('base-chip'))).toBe(true)
  })

  it('the play chip names what it does and lights while playing', async () => {
    const wrapper = mountTransport(true)
    const play = wrapper.findAll('button')[1]!
    expect(play.attributes('aria-label')).toBe('Pause replay')
    expect(play.classes()).toContain('base-chip--active')
    expect(play.findAll('rect')).toHaveLength(2)
    await wrapper.setProps({ playing: false })
    expect(wrapper.findAll('button')[1]!.attributes('aria-label')).toBe('Play replay')
    expect(wrapper.findAll('button')[1]!.classes()).not.toContain('base-chip--active')
  })

  it('LIVE is disabled while already live', () => {
    expect(
      mountTransport(false, false).get('[aria-label="Back to live"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      mountTransport(false, true).get('[aria-label="Back to live"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('emits one event per button', async () => {
    const wrapper = mountTransport()
    for (const button of wrapper.findAll('button')) await button.trigger('click')
    expect(wrapper.emitted('stepBack')).toHaveLength(1)
    expect(wrapper.emitted('togglePlaying')).toHaveLength(1)
    expect(wrapper.emitted('stepForward')).toHaveLength(1)
    expect(wrapper.emitted('goLive')).toHaveLength(1)
  })

  it('has no axe violations', async () => {
    expect(
      await axe(mountTransport().html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
