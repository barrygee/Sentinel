/**
 * Marine VHF channel plan (ITU-R Appendix 18) for the port frequencies the Sea
 * map carries.
 *
 * Port control and VTS working channels are published as channel numbers, not
 * MHz, so the port data stores channels and this module turns them into the
 * frequency an SDR tunes. Only the simplex channels are tabled: port and VTS
 * traffic uses them almost exclusively, and a duplex channel would need the
 * shore-side (transmit) frequency to be worth listening to.
 */

/** Simplex marine VHF channels, in MHz. */
export const MARINE_VHF_CHANNEL_MHZ: Readonly<Record<number, number>> = {
  6: 156.3,
  8: 156.4,
  9: 156.45,
  10: 156.5,
  11: 156.55,
  12: 156.6,
  13: 156.65,
  14: 156.7,
  15: 156.75,
  16: 156.8,
  17: 156.85,
  67: 156.375,
  68: 156.425,
  69: 156.475,
  70: 156.525,
  71: 156.575,
  72: 156.625,
  73: 156.675,
  74: 156.725,
  75: 156.775,
  76: 156.825,
  77: 156.875,
}

/** Every marine VHF voice channel is narrow FM. */
export const MARINE_VHF_MODE = 'NFM' as const

/** The frequency of a channel in Hz, or `null` for a channel not in the table. */
export function marineVhfChannelHz(channel: number): number | null {
  const megahertz = MARINE_VHF_CHANNEL_MHZ[channel]
  return megahertz === undefined ? null : Math.round(megahertz * 1e6)
}

/** A channel's frequency for display, e.g. `156.600`; empty when unknown. */
export function formatMarineVhfMhz(channel: number): string {
  const megahertz = MARINE_VHF_CHANNEL_MHZ[channel]
  return megahertz === undefined ? '' : megahertz.toFixed(3)
}
