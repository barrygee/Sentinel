import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'
import MapRailReplayButton from './MapRailReplayButton.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

describe('MapRailReplayButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is hidden while the section does not record', () => {
    const wrapper = mount(MapRailReplayButton, { props: { sectionId: 'air' } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('appears once recording is on, named and unpressed', async () => {
    const playback = usePlaybackStore()
    const wrapper = mount(MapRailReplayButton, { props: { sectionId: 'air' } })
    playback.setHistoryEnabled('air', true)
    await wrapper.vm.$nextTick()
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Replay')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('data-tooltip')).toBe('REPLAY')
    expect(button.classes()).not.toContain('active')
  })

  it('enters replay, then returns to live', async () => {
    const playback = usePlaybackStore()
    playback.setHistoryEnabled('sea', true)
    const wrapper = mount(MapRailReplayButton, { props: { sectionId: 'sea' } })
    await wrapper.get('button').trigger('click')
    expect(playback.sections.sea.mode).toBe('replay')
    const button = wrapper.get('button')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('data-tooltip')).toBe('BACK TO LIVE')
    expect(button.classes()).toContain('active')
    await button.trigger('click')
    expect(playback.sections.sea.mode).toBe('live')
  })

  it('drives only its own section', async () => {
    const playback = usePlaybackStore()
    playback.setHistoryEnabled('land', true)
    const wrapper = mount(MapRailReplayButton, { props: { sectionId: 'land' } })
    await wrapper.get('button').trigger('click')
    expect(playback.sections.air.mode).toBe('live')
  })

  it('has no axe violations', async () => {
    usePlaybackStore().setHistoryEnabled('air', true)
    const wrapper = mount(MapRailReplayButton, {
      props: { sectionId: 'air' },
      attachTo: document.body,
    })
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
    wrapper.unmount()
  })
})
