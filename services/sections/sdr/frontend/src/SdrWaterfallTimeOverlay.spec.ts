import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrWaterfallTimeOverlay from './SdrWaterfallTimeOverlay.vue'
import type {
  SignalMarkerLabel,
  WaterfallSecondTick,
  WaterfallTimeMarker,
} from './composables/useSignalMarkers'

enableAutoUnmount(afterEach)

const TIME_MARKERS: WaterfallTimeMarker[] = [
  { key: 1, topPx: 0, label: '12:00:00' },
  { key: 2, topPx: 40, label: '12:00:10' },
]
const SECOND_TICKS: WaterfallSecondTick[] = [{ key: 5, topPx: 20 }]
const SIGNAL_LABELS: SignalMarkerLabel[] = [
  { key: 'start', topPx: 60, label: '11:59:50', variant: 'start' },
  { key: 'end', topPx: 10, label: '12:00:05', variant: 'end' },
]

function mountOverlay(
  props: {
    timeMarkers?: WaterfallTimeMarker[]
    secondTicks?: WaterfallSecondTick[]
    signalLabels?: SignalMarkerLabel[]
  } = {},
) {
  return mount(SdrWaterfallTimeOverlay, {
    props: {
      timeMarkers: props.timeMarkers ?? [],
      secondTicks: props.secondTicks ?? [],
      signalLabels: props.signalLabels ?? [],
      overlayStyle: { left: '56px', top: '0px' },
    },
    attachTo: document.body,
  })
}

describe('SdrWaterfallTimeOverlay', () => {
  it('renders nothing with no markers, ticks or signal labels', () => {
    expect(mountOverlay().find('.sdr-wf-time-overlay').exists()).toBe(false)
  })

  it.each([
    ['clock markers', { timeMarkers: TIME_MARKERS }],
    ['second ticks', { secondTicks: SECOND_TICKS }],
    ['signal labels', { signalLabels: SIGNAL_LABELS }],
  ])('renders when there are only %s', (_kind, props) => {
    expect(mountOverlay(props).find('.sdr-wf-time-overlay').exists()).toBe(true)
  })

  it('pins itself to the raster data box', () => {
    const style = mountOverlay({ timeMarkers: TIME_MARKERS })
      .find('.sdr-wf-time-overlay')
      .attributes('style')
    expect(style).toContain('left: 56px')
  })

  it('places each clock label at its row', () => {
    const markers = mountOverlay({ timeMarkers: TIME_MARKERS }).findAll('.sdr-wf-time-marker')
    expect(markers.map((marker) => marker.text())).toEqual(['12:00:00', '12:00:10'])
    expect(markers.map((marker) => marker.attributes('style'))).toEqual(['top: 0px;', 'top: 40px;'])
  })

  it('draws an unlabelled tick at each whole second', () => {
    const ticks = mountOverlay({ secondTicks: SECOND_TICKS }).findAll('.sdr-wf-second-tick')
    expect(ticks).toHaveLength(1)
    expect(ticks[0]!.attributes('style')).toBe('top: 20px;')
    expect(ticks[0]!.text()).toBe('')
  })

  it('styles the signal start and end labels apart', () => {
    const labels = mountOverlay({ signalLabels: SIGNAL_LABELS }).findAll('.sdr-wf-time-label')
    expect(labels.map((label) => label.text())).toEqual(['11:59:50', '12:00:05'])
    expect(labels[0]!.classes()).toContain('sdr-wf-time-label--signal-start')
    expect(labels[0]!.classes()).not.toContain('sdr-wf-time-label--signal-end')
    expect(labels[1]!.classes()).toContain('sdr-wf-time-label--signal-end')
    expect(labels[1]!.classes()).not.toContain('sdr-wf-time-label--signal-start')
  })

  it('has no axe violations with everything shown', async () => {
    const wrapper = mountOverlay({
      timeMarkers: TIME_MARKERS,
      secondTicks: SECOND_TICKS,
      signalLabels: SIGNAL_LABELS,
    })
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
