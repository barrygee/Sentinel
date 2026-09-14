/**
 * The ports the Sea map plots, with their published VHF working channels.
 *
 * The seed mirrors the Air map's airport list: the UK and Irish commercial
 * ports and ferry terminals, keyed by UN/LOCODE the way airports are keyed by
 * ICAO. Channels are the port-control / VTS working channels from the ALRS
 * (Admiralty List of Radio Signals) plus Ch 16, the international calling and
 * distress channel every port watches. Frequencies are derived from the
 * channel plan in `@/utils/marineVhf`, so the data only ever names channels.
 */

/** One published VHF working channel of a port. */
export interface PortChannel {
  /** What the channel is for, e.g. `VTS`, `Port Control`, `Calling`. */
  label: string
  /** Marine VHF channel number. */
  channel: number
}

export interface PortProperties {
  /** UN/LOCODE, e.g. `GBSOU`. */
  locode: string
  name: string
  channels: PortChannel[]
}

const CALLING_CHANNEL: PortChannel = { label: 'Calling', channel: 16 }

/** Build one port feature; Ch 16 is appended to every port's channel list. */
function port(
  locode: string,
  name: string,
  coordinates: [number, number],
  channels: PortChannel[],
): GeoJSON.Feature<GeoJSON.Point, PortProperties> {
  return {
    type: 'Feature',
    properties: { locode, name, channels: [...channels, CALLING_CHANNEL] },
    geometry: { type: 'Point', coordinates },
  }
}

export const PORTS_DATA: GeoJSON.FeatureCollection<GeoJSON.Point, PortProperties> = {
  type: 'FeatureCollection',
  features: [
    // ── South coast ─────────────────────────────────────────────────────────
    port(
      'GBSOU',
      'Southampton',
      [-1.4045, 50.8995],
      [
        { label: 'VTS', channel: 12 },
        { label: 'Patrol', channel: 14 },
      ],
    ),
    port('GBPME', 'Portsmouth', [-1.1085, 50.7975], [{ label: 'QHM', channel: 11 }]),
    port('GBPOO', 'Poole', [-1.99, 50.71], [{ label: 'Harbour Control', channel: 14 }]),
    port('GBPTL', 'Portland', [-2.44, 50.57], [{ label: 'Harbour Radio', channel: 74 }]),
    port('GBPLY', 'Plymouth', [-4.15, 50.365], [{ label: 'Longroom', channel: 14 }]),
    port('GBFAL', 'Falmouth', [-5.06, 50.155], [{ label: 'Harbour Radio', channel: 12 }]),
    port('GBNHV', 'Newhaven', [0.055, 50.79], [{ label: 'Port Radio', channel: 12 }]),
    port('GBDVR', 'Dover', [1.3235, 51.1265], [{ label: 'Port Control', channel: 74 }]),
    port('GBRMG', 'Ramsgate', [1.42, 51.33], [{ label: 'Port Control', channel: 14 }]),
    // ── Thames, Medway and East Anglia ──────────────────────────────────────
    port(
      'GBLON',
      'London',
      [0.373, 51.443],
      [
        { label: 'VTS Lower', channel: 69 },
        { label: 'VTS Upper', channel: 68 },
        { label: 'VTS Barrier', channel: 14 },
      ],
    ),
    port('GBSSS', 'Sheerness', [0.745, 51.445], [{ label: 'Medway VTS', channel: 74 }]),
    port('GBFXT', 'Felixstowe', [1.31, 51.955], [{ label: 'Harwich VTS', channel: 71 }]),
    port(
      'GBHRW',
      'Harwich',
      [1.285, 51.947],
      [
        { label: 'Harwich VTS', channel: 71 },
        { label: 'Port Control', channel: 11 },
      ],
    ),
    port('GBIPS', 'Ipswich', [1.16, 52.045], [{ label: 'Port Radio', channel: 68 }]),
    port('GBGTY', 'Great Yarmouth', [1.735, 52.58], [{ label: 'Port Radio', channel: 12 }]),
    // ── Humber, Tees, Tyne and the north-east ──────────────────────────────
    port(
      'GBHUL',
      'Hull',
      [-0.31, 53.74],
      [
        { label: 'VTS Humber', channel: 12 },
        { label: 'VTS Upper', channel: 14 },
      ],
    ),
    port(
      'GBIMM',
      'Immingham',
      [-0.19, 53.63],
      [
        { label: 'VTS Humber', channel: 12 },
        { label: 'Docks', channel: 68 },
      ],
    ),
    port('GBTEE', 'Teesport', [-1.155, 54.61], [{ label: 'Port Control', channel: 14 }]),
    port('GBSUN', 'Sunderland', [-1.37, 54.915], [{ label: 'Port Control', channel: 14 }]),
    port('GBTYN', 'Tyne', [-1.43, 55.005], [{ label: 'VTS', channel: 12 }]),
    port('GBBLY', 'Blyth', [-1.5, 55.125], [{ label: 'Harbour Control', channel: 12 }]),
    // ── Scotland ────────────────────────────────────────────────────────────
    port('GBGRG', 'Grangemouth', [-3.71, 56.02], [{ label: 'Forth Navigation', channel: 71 }]),
    port('GBDUN', 'Dundee', [-2.955, 56.46], [{ label: 'Harbour Radio', channel: 12 }]),
    port('GBABD', 'Aberdeen', [-2.075, 57.145], [{ label: 'VTS', channel: 12 }]),
    port('GBPHD', 'Peterhead', [-1.775, 57.5], [{ label: 'Harbour', channel: 14 }]),
    port('GBIVG', 'Invergordon', [-4.17, 57.685], [{ label: 'Cromarty Firth', channel: 11 }]),
    port('GBLER', 'Lerwick', [-1.145, 60.155], [{ label: 'Harbour', channel: 12 }]),
    port('GBGRK', 'Greenock', [-4.765, 55.955], [{ label: 'Estuary Radio', channel: 12 }]),
    port('GBCYN', 'Cairnryan', [-5.02, 54.97], [{ label: 'Harbour', channel: 14 }]),
    // ── Irish Sea, Wales and the west ──────────────────────────────────────
    port('GBHYM', 'Heysham', [-2.92, 54.03], [{ label: 'Port', channel: 14 }]),
    port('GBLIV', 'Liverpool', [-3.0045, 53.4055], [{ label: 'Mersey VTS', channel: 12 }]),
    port('GBHLY', 'Holyhead', [-4.63, 53.315], [{ label: 'Port Control', channel: 14 }]),
    port('GBFIS', 'Fishguard', [-4.98, 52.01], [{ label: 'Harbour', channel: 14 }]),
    port('GBMLF', 'Milford Haven', [-5.03, 51.705], [{ label: 'Port Control', channel: 12 }]),
    port('GBSWA', 'Swansea', [-3.925, 51.615], [{ label: 'Docks', channel: 14 }]),
    port('GBCDF', 'Cardiff', [-3.16, 51.455], [{ label: 'Port Radio', channel: 14 }]),
    port('GBBRS', 'Bristol', [-2.715, 51.505], [{ label: 'VTS', channel: 12 }]),
    port('IMDGS', 'Douglas', [-4.47, 54.15], [{ label: 'Harbour', channel: 12 }]),
    // ── Ireland ─────────────────────────────────────────────────────────────
    port('GBBEL', 'Belfast', [-5.895, 54.615], [{ label: 'Harbour Radio', channel: 12 }]),
    port('GBLAR', 'Larne', [-5.795, 54.85], [{ label: 'Harbour', channel: 14 }]),
    port('IEDUB', 'Dublin', [-6.205, 53.3455], [{ label: 'VTS', channel: 12 }]),
    port('IEROS', 'Rosslare', [-6.34, 52.25], [{ label: 'Harbour', channel: 12 }]),
    port('IEORK', 'Cork', [-8.3, 51.84], [{ label: 'Harbour Radio', channel: 12 }]),
  ],
}

/** Look a port up by UN/LOCODE. */
export function findPort(
  locode: string,
): GeoJSON.Feature<GeoJSON.Point, PortProperties> | undefined {
  return PORTS_DATA.features.find((feature) => feature.properties.locode === locode)
}
