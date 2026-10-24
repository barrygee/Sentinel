import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { LocalConfigImportResult } from '../../api/types'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import ConfigImportReport from './ConfigImportReport.vue'

function makeResult(overrides: Partial<LocalConfigImportResult> = {}): LocalConfigImportResult {
  return {
    devices: [],
    devices_applied: 0,
    devices_skipped: 0,
    devices_failed: 0,
    hotspot_applied: false,
    hotspot_detail: '',
    console_password_applied: false,
    console_password_detail: '',
    generated_at: 0,
    ...overrides,
  }
}

function summaryOf(overrides: Partial<LocalConfigImportResult>): string {
  return mount(ConfigImportReport, { props: { result: makeResult(overrides) } })
    .get('.config-report-summary')
    .text()
}

describe('ConfigImportReport', () => {
  it('counts devices applied, skipped and failed', () => {
    expect(summaryOf({ devices_applied: 3, devices_skipped: 2, devices_failed: 1 })).toBe(
      'Imported: 3 devices applied, 2 skipped, 1 failed.',
    )
  })

  it('uses the singular for exactly one applied device', () => {
    expect(summaryOf({ devices_applied: 1 })).toContain('1 device applied')
  })

  it('uses the plural for zero applied devices', () => {
    expect(summaryOf({ devices_applied: 0 })).toContain('0 devices applied')
  })

  it('says the hotspot was applied only when it was', () => {
    expect(summaryOf({ hotspot_applied: true })).toContain('Hotspot applied.')
    expect(summaryOf({ hotspot_applied: false })).not.toContain('Hotspot applied.')
  })

  it('lists only devices that were not applied, FAILED or SKIPPED, with the reason', () => {
    const wrapper = mount(ConfigImportReport, {
      props: {
        result: makeResult({
          devices: [
            { identity_kind: 'serial', identity_key: 'AAA', outcome: 'applied', detail: '' },
            {
              identity_kind: 'serial',
              identity_key: 'BBB',
              outcome: 'skipped',
              detail: 'not plugged in',
            },
            { identity_kind: 'serial', identity_key: 'CCC', outcome: 'failed', detail: '' },
          ],
        }),
      },
    })
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toBe('SKIPPED BBB — not plugged in')
    expect(items[1]!.text()).toBe('FAILED CCC')
  })

  it('renders no list when every device was applied', () => {
    const wrapper = mount(ConfigImportReport, {
      props: {
        result: makeResult({
          devices: [
            { identity_kind: 'serial', identity_key: 'AAA', outcome: 'applied', detail: '' },
          ],
        }),
      },
    })
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('explains why the hotspot was not applied', () => {
    const wrapper = mount(ConfigImportReport, {
      props: { result: makeResult({ hotspot_detail: 'No Wi-Fi here.' }) },
    })
    expect(wrapper.text()).toContain('Hotspot not applied: No Wi-Fi here.')
  })

  it('does not explain the hotspot when it was applied or there is nothing to say', () => {
    expect(
      mount(ConfigImportReport, {
        props: { result: makeResult({ hotspot_applied: true, hotspot_detail: 'Fine.' }) },
      }).text(),
    ).not.toContain('Hotspot not applied')
    expect(mount(ConfigImportReport, { props: { result: makeResult() } }).text()).not.toContain(
      'Hotspot not applied',
    )
  })

  it('reports a console password set from the file', () => {
    const text = mount(ConfigImportReport, {
      props: {
        result: makeResult({ console_password_applied: true, console_password_detail: 'ignored' }),
      },
    }).text()
    expect(text).toContain('Console password set from the file.')
    expect(text).not.toContain('not applied: ignored')
  })

  it('explains why a console password was not applied', () => {
    const text = mount(ConfigImportReport, {
      props: { result: makeResult({ console_password_detail: 'Too short.' }) },
    }).text()
    expect(text).toContain('Console password not applied: Too short.')
  })

  it('says nothing about the console password when the file had none', () => {
    expect(mount(ConfigImportReport, { props: { result: makeResult() } }).text()).not.toContain(
      'Console password',
    )
  })

  it('has no accessibility violations', async () => {
    await expectNoAxeViolations(
      mount(ConfigImportReport, {
        props: {
          result: makeResult({
            devices: [
              { identity_kind: 'serial', identity_key: 'BBB', outcome: 'failed', detail: 'busy' },
            ],
            hotspot_detail: 'No Wi-Fi.',
            console_password_detail: 'Too short.',
          }),
        },
      }),
    )
  })
})
