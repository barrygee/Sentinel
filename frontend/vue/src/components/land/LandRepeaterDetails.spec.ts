import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import LandRepeaterDetails from './LandRepeaterDetails.vue'
import type { RepeaterChannel, RepeaterStation } from '@/types/repeaters'

/**
 * `LandRepeaterDetails` is the accordion body for one repeater site in the
 * Land FILTER pane: the site's identity and position, then one grid per
 * licensed channel. The component is a presenter — the parent tunes, saves and
 * flies the map — so the tests pin down what it *renders* for sparse register
 * data (most optional fields are nullable upstream) and that every action
 * reports which channel and which end of it the operator meant.
 */

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1234,
    band: '70CM',
    channel: 'RB0',
    txMhz: 433.0,
    rxMhz: 434.6,
    modes: ['A', 'M'],
    ctcssHz: 118.8,
    dmrColourCode: 5,
    heightMagl: 45,
    erpDbw: 12,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

function station(overrides: Partial<RepeaterStation> = {}): RepeaterStation {
  return {
    callsign: 'GB3NR',
    latitude: 52.633_21,
    longitude: 1.297_68,
    locator: 'JO02PS',
    location: 'NORWICH',
    postcode: 'NR2',
    region: 'EA',
    keeper: 'G4XYZ',
    channels: [channel()],
    ...overrides,
  }
}

type DetailsProps = {
  station: RepeaterStation
  sdrConnected: boolean
  isSaved: (mhz: number) => boolean
  tuneNotice: boolean
}

function mountDetails(overrides: Partial<DetailsProps> = {}) {
  return mount(LandRepeaterDetails, {
    props: {
      station: station(),
      sdrConnected: true,
      isSaved: () => false,
      tuneNotice: false,
      ...overrides,
    },
  })
}

/** Read a grid section's cells as `{ LABEL: value }`, in render order. */
function cellsByLabel(wrapper: ReturnType<typeof mountDetails>): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const cell of wrapper.findAll('.ba-data-cell')) {
    entries[cell.get('.ba-data-cell-label').text()] = cell.get('.ba-data-cell-value').text()
  }
  return entries
}

function sectionTitles(wrapper: ReturnType<typeof mountDetails>): string[] {
  return wrapper.findAll('.ba-data-grid-title').map((title) => title.text())
}

describe('LandRepeaterDetails', () => {
  it('lists the site identity and position, but not the callsign the row header carries', () => {
    const cells = cellsByLabel(mountDetails())
    expect(cells['LOCATION']).toBe('NORWICH')
    expect(cells['LOCATOR']).toBe('JO02PS')
    expect(cells['POSTCODE']).toBe('NR2')
    expect(cells['REGION']).toBe('EA')
    expect(cells['KEEPER']).toBe('G4XYZ')
    expect(cells['LATITUDE']).toBe('52.6332')
    expect(cells['LONGITUDE']).toBe('1.2977')
    expect(Object.keys(cells)).not.toContain('CALLSIGN')
  })

  it('dashes every field the register withheld rather than showing "null"', () => {
    const cells = cellsByLabel(
      mountDetails({
        station: station({
          location: null,
          locator: null,
          postcode: null,
          region: null,
          keeper: null,
          channels: [
            channel({ heightMagl: null, erpDbw: null, ctcssHz: null, dmrColourCode: null }),
          ],
        }),
      }),
    )
    expect(cells['LOCATION']).toBe('—')
    expect(cells['LOCATOR']).toBe('—')
    expect(cells['POSTCODE']).toBe('—')
    expect(cells['REGION']).toBe('—')
    expect(cells['KEEPER']).toBe('—')
    expect(cells['HEIGHT']).toBe('—')
    expect(cells['ERP']).toBe('—')
    expect(cells['CTCSS / CC']).toBe('—')
  })

  it('formats height, ERP, offset and access from the register numbers', () => {
    const cells = cellsByLabel(mountDetails())
    expect(cells['HEIGHT']).toBe('45 m AGL')
    expect(cells['ERP']).toBe('12 dBW')
    expect(cells['OFFSET']).toBe('+1.6000 MHz')
    expect(cells['CTCSS / CC']).toBe('118.8 Hz · CC5')
    expect(cells['STATUS']).toBe('ON AIR')
    expect(cells['MODES']).toBe('FM · DMR')
  })

  it('words an off-air channel as OFF AIR, in a cell that may wrap', () => {
    const wrapper = mountDetails({
      station: station({ channels: [channel({ status: 'NOT OPERATIONAL' })] }),
    })
    expect(cellsByLabel(wrapper)['STATUS']).toBe('OFF AIR')
    // The wrapping wrapper is what stops a long status ellipsising mid-word.
    const statusCell = wrapper
      .findAll('.land-repeater-wrapping .ba-data-cell')
      .find((cell) => cell.get('.ba-data-cell-label').text() === 'STATUS')
    expect(statusCell).toBeDefined()
  })

  it('dashes the mode list of a channel the register lists no modes for', () => {
    expect(
      cellsByLabel(mountDetails({ station: station({ channels: [channel({ modes: [] })] }) }))[
        'MODES'
      ],
    ).toBe('—')
  })

  describe('the channel sections', () => {
    it('titles a channel with its band and UK designator', () => {
      expect(sectionTitles(mountDetails())).toEqual(['SITE', '70CM · RB0'])
    })

    it('titles a channel with no allocated designator by band alone', () => {
      const wrapper = mountDetails({ station: station({ channels: [channel({ channel: null })] }) })
      expect(sectionTitles(wrapper)).toEqual(['SITE', '70CM'])
    })

    it('renders one section per channel of a dual-band site', () => {
      const wrapper = mountDetails({
        station: station({
          channels: [
            channel({ id: 1, band: '2M', channel: 'RV52' }),
            channel({ id: 2, band: '70CM', channel: 'RB0' }),
          ],
        }),
      })
      expect(sectionTitles(wrapper)).toEqual(['SITE', '2M · RV52', '70CM · RB0'])
    })

    it('keys a channel the register gave no id by its band and output frequency', () => {
      // Two id-less channels must still render as two distinct rows — a shared
      // key would collapse them into one.
      const wrapper = mountDetails({
        station: station({
          channels: [
            channel({ id: null, band: '2M', channel: null, txMhz: 145.6 }),
            channel({ id: null, band: '2M', channel: null, txMhz: 145.7 }),
          ],
        }),
      })
      expect(sectionTitles(wrapper)).toEqual(['SITE', '2M', '2M'])
      expect(wrapper.findAll('.lrfc').length).toBe(4)
    })

    it('renders no channel section for a site the register lists no channels for', () => {
      const wrapper = mountDetails({ station: station({ channels: [] }) })
      expect(sectionTitles(wrapper)).toEqual(['SITE'])
      expect(wrapper.findAll('.lrfc')).toHaveLength(0)
    })
  })

  describe('the position links', () => {
    it('emits locate with the callsign from latitude and from longitude', async () => {
      const wrapper = mountDetails()
      const links = wrapper.findAll('.land-repeater-locate')
      expect(links).toHaveLength(2)
      await links[0]!.trigger('click')
      await links[1]!.trigger('click')
      expect(wrapper.emitted('locate')).toEqual([['GB3NR'], ['GB3NR']])
    })

    it('names what each link does, and does not let the click reach the row behind it', async () => {
      // The body sits inside the pane's expanded accordion row; a bubbling
      // click would collapse the row the operator is reading.
      const onClick = vi.fn()
      const wrapper = mountDetails()
      wrapper.element.addEventListener('click', onClick)
      const link = wrapper.get('.land-repeater-locate')
      expect(link.attributes('title')).toBe('Show GB3NR on the map')
      expect((link.element as HTMLButtonElement).type).toBe('button')
      await link.trigger('click')
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe('the frequency cells', () => {
    it('hands the output and input frequencies to the tune cells as NFM', () => {
      const cells = cellsByLabel(mountDetails())
      expect(cells['OUTPUT · NFM']).toBe('433.0000')
      expect(cells['INPUT · NFM']).toBe('434.6000')
    })

    it('passes the connected state through, so a cell can say tuning will not work', () => {
      const wrapper = mountDetails({ sdrConnected: false })
      expect(wrapper.get('.lrfc-tune').attributes('title')).toBe('Connect an SDR to tune')
    })

    it('asks isSaved per frequency so only the stored one shows a filled bookmark', () => {
      const isSaved = vi.fn((mhz: number) => mhz === 434.6)
      const wrapper = mountDetails({ isSaved })
      expect(isSaved).toHaveBeenCalledWith(433.0)
      expect(isSaved).toHaveBeenCalledWith(434.6)
      const bookmarks = wrapper.findAll('.lrfc-save')
      expect(bookmarks[0]!.attributes('aria-pressed')).toBe('false')
      expect(bookmarks[1]!.attributes('aria-pressed')).toBe('true')
    })

    it('emits tune with the channel and which end of it was clicked', async () => {
      const onlyChannel = channel()
      const wrapper = mountDetails({ station: station({ channels: [onlyChannel] }) })
      const tuneCells = wrapper.findAll('.lrfc-tune')
      await tuneCells[0]!.trigger('click')
      await tuneCells[1]!.trigger('click')
      expect(wrapper.emitted('tune')).toEqual([
        [onlyChannel, 'output'],
        [onlyChannel, 'input'],
      ])
    })

    it('emits save for an unsaved frequency and unsave for a stored one', async () => {
      const onlyChannel = channel()
      const wrapper = mountDetails({
        station: station({ channels: [onlyChannel] }),
        isSaved: (mhz: number) => mhz === onlyChannel.rxMhz,
      })
      const bookmarks = wrapper.findAll('.lrfc-save')
      await bookmarks[0]!.trigger('click')
      await bookmarks[1]!.trigger('click')
      expect(wrapper.emitted('save')).toEqual([[onlyChannel, 'output']])
      expect(wrapper.emitted('unsave')).toEqual([[onlyChannel, 'input']])
    })

    it('reports the right side when it is the output that is already stored', async () => {
      // The mirror of the case above: each cell must name its own end, or a
      // bookmark would remove the wrong frequency from the manager.
      const onlyChannel = channel()
      const wrapper = mountDetails({
        station: station({ channels: [onlyChannel] }),
        isSaved: (mhz: number) => mhz === onlyChannel.txMhz,
      })
      const bookmarks = wrapper.findAll('.lrfc-save')
      await bookmarks[0]!.trigger('click')
      await bookmarks[1]!.trigger('click')
      expect(wrapper.emitted('unsave')).toEqual([[onlyChannel, 'output']])
      expect(wrapper.emitted('save')).toEqual([[onlyChannel, 'input']])
    })
  })

  describe('the tune notice', () => {
    it('is absent while it has nothing to warn about', () => {
      expect(mountDetails().find('.land-repeater-notice').exists()).toBe(false)
    })

    it('announces the missing SDR politely, above the frequencies it concerns', () => {
      const wrapper = mountDetails({ tuneNotice: true, sdrConnected: false })
      const notice = wrapper.get('.land-repeater-notice')
      expect(notice.text()).toBe('Connect an SDR before tuning')
      expect(notice.attributes('role')).toBe('status')
      // Before the channel grids, so a screen reader meets it first.
      const html = wrapper.html()
      expect(html.indexOf('land-repeater-notice')).toBeLessThan(html.indexOf('OUTPUT · NFM'))
    })
  })

  it('has no accessibility violations, with the notice up and with sparse data', async () => {
    // `region` is off: the body always renders inside the FILTER pane's
    // landmark, never as a bare page fragment as it does here.
    const axeOptions = { rules: { region: { enabled: false } } }
    expect(await axe(mountDetails({ tuneNotice: true }).element, axeOptions)).toHaveNoViolations()
    expect(
      await axe(
        mountDetails({
          station: station({ location: null, locator: null, postcode: null, channels: [] }),
        }).element,
        axeOptions,
      ),
    ).toHaveNoViolations()
  })

  it('keeps every action keyboard-focusable', () => {
    const wrapper = mountDetails()
    document.body.appendChild(wrapper.element)
    const buttons = wrapper.findAll('button')
    // Two position links, plus a tune cell and a bookmark per frequency.
    expect(buttons).toHaveLength(6)
    for (const button of buttons) {
      const element = button.element as HTMLButtonElement
      element.focus()
      expect(document.activeElement).toBe(element)
    }
    wrapper.unmount()
  })
})
