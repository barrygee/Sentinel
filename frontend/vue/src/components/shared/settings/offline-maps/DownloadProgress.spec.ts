import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DownloadProgress from './DownloadProgress.vue'
import type { OfflineRegionPhase, OfflineRegionStatus } from '@/services/offlineMapsApi'

function mountProgress(props: {
  status?: OfflineRegionStatus
  phase?: OfflineRegionPhase
  bytesDone?: number
  bytesEstimated?: number
}) {
  return mount(DownloadProgress, {
    props: {
      status: props.status ?? 'running',
      phase: 'phase' in props ? (props.phase as OfflineRegionPhase) : 'basemap',
      bytesDone: props.bytesDone ?? 0,
      bytesEstimated: props.bytesEstimated ?? 0,
    },
  })
}

describe('DownloadProgress', () => {
  it('renders an indeterminate native progress bar (no value attribute) while queued with no bytes yet', () => {
    const wrapper = mountProgress({
      status: 'queued',
      phase: null,
      bytesDone: 0,
      bytesEstimated: 0,
    })
    expect(wrapper.find('progress').attributes('value')).toBeUndefined()
    expect(wrapper.text()).toContain('QUEUED — starting…')
  })

  it('stays indeterminate once an estimate exists but no bytes have arrived yet', () => {
    const wrapper = mountProgress({ bytesDone: 0, bytesEstimated: 1000 })
    expect(wrapper.find('progress').attributes('value')).toBeUndefined()
  })

  it('becomes determinate and shows percent/MB once bytes start arriving', () => {
    const wrapper = mountProgress({ bytesDone: 250, bytesEstimated: 1000 })
    expect(wrapper.find('progress').attributes('value')).toBe('25')
    expect(wrapper.text()).toContain('25% · 250 B / up to 1000 B')
  })

  it('clamps the percent at 100 even if bytes_done overshoots the estimate', () => {
    const wrapper = mountProgress({ bytesDone: 1200, bytesEstimated: 1000 })
    expect(wrapper.find('progress').attributes('value')).toBe('100')
  })

  it.each([
    ['basemap' as const, 'DOWNLOADING BASEMAP'],
    ['terrain' as const, 'DOWNLOADING TERRAIN'],
  ])('labels the %s phase', (phase, expectedLabel) => {
    const wrapper = mountProgress({ status: 'running', phase, bytesDone: 1, bytesEstimated: 10 })
    expect(wrapper.text()).toContain(expectedLabel)
  })

  it('falls back to the uppercased status when there is no phase', () => {
    const wrapper = mountProgress({
      status: 'failed',
      phase: null,
      bytesDone: 1,
      bytesEstimated: 10,
    })
    expect(wrapper.text()).toContain('FAILED')
  })

  it('emits cancel when the CANCEL button is clicked', async () => {
    const wrapper = mountProgress({})
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('has no accessibility violations, indeterminate or determinate', async () => {
    const indeterminate = mountProgress({ status: 'queued', phase: null })
    expect(
      await axe(indeterminate.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    const determinate = mountProgress({ bytesDone: 500, bytesEstimated: 1000 })
    expect(
      await axe(determinate.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
