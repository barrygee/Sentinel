/**
 * One measured planform per aircraft family.
 *
 * Each family is drawn from the published dimensions of a single reference
 * aircraft (named in its `reference`). Other types in the family reuse it,
 * stretched to their own length and span (`aircraftTypeDimensions.ts`), so an
 * A321 comes out longer than an A319 from the same drawing.
 *
 * Figures are approximate public values in metres — length, span, sweep and
 * engine positions to roughly half a metre. At 20–30px on a map that is far
 * finer than a pixel; what matters is that proportions and engine layouts are
 * right, which is what tells a 747 from an A330 at a glance.
 */
import type { AircraftPlanform } from '@sentinel/map-kit/aircraft-silhouettes/aircraftPlanform'

/** Every family Sentinel can draw. */
export const AIRCRAFT_FAMILY_IDS = [
  'lightSingleProp',
  'lightTwinProp',
  'singleTurboprop',
  'twinTurbopropSmall',
  'twinTurbopropRegional',
  'quadTurboprop',
  'lightJet',
  'businessJet',
  'regionalJetRearEngine',
  'regionalJetUnderwing',
  'narrowbodyTwin',
  'narrowbodyQuad',
  'widebodyTwin',
  'widebodyQuad',
  'trijet',
  'militaryTransportJet',
  'awacs',
  'fighterSingleFin',
  'fighterTwinFin',
  'fighterCanardDelta',
  'hawkTrainer',
  'f35Lightning',
  'helicopter',
  'helicopterTandem',
  'tiltrotor',
  'gyrocopter',
  'glider',
  'microlight',
  'balloon',
  'airship',
  'uav',
] as const

/** Identifier of one drawable family. */
export type AircraftFamilyId = (typeof AIRCRAFT_FAMILY_IDS)[number]

/** A family: its reference aircraft's dimensions and planform. */
export interface AircraftFamily {
  id: AircraftFamilyId
  /** Short human name, used in previews and accessible labels. */
  label: string
  /** The real aircraft the planform was measured from. */
  reference: string
  /** Reference overall length (nose to tail, rotors included), in metres. */
  referenceLength: number
  /** Reference overall span (wingtips, rotor tips or fin tips), in metres. */
  referenceSpan: number
  /**
   * Draw upright whatever the reported track. Set for shapes drawn in side view,
   * where turning the icon would only tip it over.
   */
  fixedOrientation?: boolean
  planform: AircraftPlanform
}

/** The catalogue, keyed by family id. */
export const AIRCRAFT_FAMILIES: Readonly<Record<AircraftFamilyId, AircraftFamily>> = {
  lightSingleProp: {
    id: 'lightSingleProp',
    label: 'Light single prop',
    reference: 'Cessna 172',
    referenceLength: 8.3,
    referenceSpan: 11.0,
    planform: {
      fuselage: {
        length: 8.3,
        width: 1.1,
        noseLength: 1.3,
        tailConeLength: 4.0,
        tailTipWidth: 0.25,
        noseShape: 'blunt',
      },
      wing: {
        span: 11.0,
        rootChord: 1.6,
        tipChord: 1.1,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 2.0,
      },
      tailplane: {
        span: 3.4,
        rootChord: 1.2,
        tipChord: 0.8,
        leadingEdgeSweepDeg: 12,
        rootLeadingEdgeFromNose: 7.0,
      },
      engines: [{ lateralOffset: 0, fromNose: 0, length: 0, diameter: 0, propellerDiameter: 1.9 }],
    },
  },

  lightTwinProp: {
    id: 'lightTwinProp',
    label: 'Light twin prop',
    reference: 'Piper PA-34 Seneca',
    referenceLength: 8.7,
    referenceSpan: 11.9,
    planform: {
      fuselage: {
        length: 8.7,
        width: 1.25,
        noseLength: 1.7,
        tailConeLength: 3.6,
        tailTipWidth: 0.25,
        noseShape: 'rounded',
      },
      wing: {
        span: 11.9,
        rootChord: 1.6,
        tipChord: 1.5,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 2.6,
      },
      tailplane: {
        span: 3.9,
        rootChord: 0.9,
        tipChord: 0.9,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 7.7,
      },
      engines: [
        {
          lateralOffset: 1.7,
          fromNose: 1.8,
          length: 2.3,
          diameter: 0.7,
          propellerDiameter: 1.9,
        },
      ],
    },
  },

  singleTurboprop: {
    id: 'singleTurboprop',
    label: 'Single turboprop',
    reference: 'Pilatus PC-12',
    referenceLength: 14.4,
    referenceSpan: 16.3,
    planform: {
      fuselage: {
        length: 14.4,
        width: 1.6,
        noseLength: 2.8,
        tailConeLength: 5.0,
        tailTipWidth: 0.3,
        noseShape: 'rounded',
      },
      wing: {
        span: 16.3,
        rootChord: 2.6,
        tipChord: 1.3,
        leadingEdgeSweepDeg: 2,
        rootLeadingEdgeFromNose: 4.6,
      },
      tailplane: {
        span: 5.6,
        rootChord: 1.6,
        tipChord: 0.9,
        leadingEdgeSweepDeg: 20,
        rootLeadingEdgeFromNose: 12.4,
      },
      engines: [{ lateralOffset: 0, fromNose: 0, length: 0, diameter: 0, propellerDiameter: 2.7 }],
    },
  },

  twinTurbopropSmall: {
    id: 'twinTurbopropSmall',
    label: 'Twin turboprop',
    reference: 'Beechcraft King Air 350',
    referenceLength: 14.2,
    referenceSpan: 17.7,
    planform: {
      fuselage: {
        length: 14.2,
        width: 1.5,
        noseLength: 2.4,
        tailConeLength: 5.0,
        tailTipWidth: 0.3,
        noseShape: 'rounded',
      },
      wing: {
        span: 17.7,
        rootChord: 2.2,
        tipChord: 1.0,
        leadingEdgeSweepDeg: 3,
        rootLeadingEdgeFromNose: 4.8,
      },
      tailplane: {
        span: 5.6,
        rootChord: 1.6,
        tipChord: 0.9,
        leadingEdgeSweepDeg: 25,
        rootLeadingEdgeFromNose: 12.0,
      },
      engines: [
        {
          lateralOffset: 2.6,
          fromNose: 3.6,
          length: 3.2,
          diameter: 0.75,
          propellerDiameter: 2.7,
        },
      ],
    },
  },

  twinTurbopropRegional: {
    id: 'twinTurbopropRegional',
    label: 'Regional turboprop',
    reference: 'ATR 72',
    referenceLength: 27.2,
    referenceSpan: 27.1,
    planform: {
      fuselage: {
        length: 27.2,
        width: 2.8,
        noseLength: 3.5,
        tailConeLength: 8.0,
        tailTipWidth: 0.6,
        noseShape: 'rounded',
      },
      wing: {
        span: 27.1,
        rootChord: 2.6,
        tipChord: 1.4,
        leadingEdgeSweepDeg: 2,
        rootLeadingEdgeFromNose: 10.6,
      },
      tailplane: {
        span: 7.3,
        rootChord: 2.4,
        tipChord: 1.2,
        leadingEdgeSweepDeg: 25,
        rootLeadingEdgeFromNose: 23.6,
      },
      engines: [
        {
          lateralOffset: 4.1,
          fromNose: 8.8,
          length: 5.2,
          diameter: 1.1,
          propellerDiameter: 3.9,
        },
      ],
    },
  },

  quadTurboprop: {
    id: 'quadTurboprop',
    label: 'Four-engine turboprop',
    reference: 'Lockheed C-130J Hercules',
    referenceLength: 29.8,
    referenceSpan: 40.4,
    planform: {
      fuselage: {
        length: 29.8,
        width: 4.3,
        noseLength: 3.8,
        tailConeLength: 9.5,
        tailTipWidth: 1.2,
        noseShape: 'rounded',
      },
      wing: {
        span: 40.4,
        rootChord: 4.9,
        tipChord: 2.5,
        leadingEdgeSweepDeg: 3,
        rootLeadingEdgeFromNose: 9.2,
      },
      tailplane: {
        span: 16.0,
        rootChord: 3.6,
        tipChord: 1.8,
        leadingEdgeSweepDeg: 10,
        rootLeadingEdgeFromNose: 25.6,
      },
      engines: [
        {
          lateralOffset: 5.0,
          fromNose: 7.0,
          length: 4.8,
          diameter: 1.1,
          propellerDiameter: 4.1,
        },
        {
          lateralOffset: 10.0,
          fromNose: 7.4,
          length: 4.6,
          diameter: 1.1,
          propellerDiameter: 4.1,
        },
      ],
    },
  },

  lightJet: {
    id: 'lightJet',
    label: 'Light jet',
    reference: 'Cessna Citation CJ3',
    referenceLength: 15.6,
    referenceSpan: 16.3,
    planform: {
      fuselage: {
        length: 15.6,
        width: 1.6,
        noseLength: 3.0,
        tailConeLength: 4.8,
        tailTipWidth: 0.3,
        noseShape: 'pointed',
      },
      wing: {
        span: 16.3,
        rootChord: 2.4,
        tipChord: 1.2,
        leadingEdgeSweepDeg: 3,
        rootLeadingEdgeFromNose: 6.0,
      },
      tailplane: {
        span: 6.0,
        rootChord: 1.5,
        tipChord: 0.8,
        leadingEdgeSweepDeg: 15,
        rootLeadingEdgeFromNose: 13.8,
      },
      engines: [{ lateralOffset: 1.45, fromNose: 10.4, length: 2.6, diameter: 0.85 }],
    },
  },

  businessJet: {
    id: 'businessJet',
    label: 'Business jet',
    reference: 'Bombardier Challenger 350',
    referenceLength: 20.9,
    referenceSpan: 21.0,
    planform: {
      fuselage: {
        length: 20.9,
        width: 2.2,
        noseLength: 3.2,
        tailConeLength: 6.5,
        tailTipWidth: 0.4,
        noseShape: 'pointed',
      },
      wing: {
        span: 21.0,
        rootChord: 4.0,
        tipChord: 1.3,
        leadingEdgeSweepDeg: 28,
        rootLeadingEdgeFromNose: 8.3,
        trailingEdgeKinkFraction: 0.3,
      },
      tailplane: {
        span: 7.0,
        rootChord: 1.9,
        tipChord: 1.0,
        leadingEdgeSweepDeg: 32,
        rootLeadingEdgeFromNose: 17.8,
      },
      engines: [{ lateralOffset: 1.9, fromNose: 13.8, length: 3.4, diameter: 1.15 }],
    },
  },

  regionalJetRearEngine: {
    id: 'regionalJetRearEngine',
    label: 'Regional jet, rear engines',
    reference: 'Bombardier CRJ900',
    referenceLength: 36.2,
    referenceSpan: 24.9,
    planform: {
      fuselage: {
        length: 36.2,
        width: 2.7,
        noseLength: 3.8,
        tailConeLength: 8.0,
        tailTipWidth: 0.5,
        noseShape: 'pointed',
      },
      wing: {
        span: 24.9,
        rootChord: 5.0,
        tipChord: 1.3,
        leadingEdgeSweepDeg: 27,
        rootLeadingEdgeFromNose: 14.5,
        trailingEdgeKinkFraction: 0.3,
      },
      tailplane: {
        span: 8.5,
        rootChord: 2.4,
        tipChord: 1.2,
        leadingEdgeSweepDeg: 33,
        rootLeadingEdgeFromNose: 32.2,
      },
      engines: [{ lateralOffset: 2.4, fromNose: 26.0, length: 4.6, diameter: 1.45 }],
    },
  },

  regionalJetUnderwing: {
    id: 'regionalJetUnderwing',
    label: 'Regional jet',
    reference: 'Embraer E190',
    referenceLength: 36.2,
    referenceSpan: 28.7,
    planform: {
      fuselage: {
        length: 36.2,
        width: 3.0,
        noseLength: 3.8,
        tailConeLength: 8.5,
        tailTipWidth: 0.5,
        noseShape: 'rounded',
      },
      wing: {
        span: 28.7,
        rootChord: 5.6,
        tipChord: 1.4,
        leadingEdgeSweepDeg: 27,
        rootLeadingEdgeFromNose: 13.5,
        trailingEdgeKinkFraction: 0.32,
      },
      tailplane: {
        span: 12.1,
        rootChord: 2.9,
        tipChord: 1.2,
        leadingEdgeSweepDeg: 33,
        rootLeadingEdgeFromNose: 29.8,
      },
      engines: [{ lateralOffset: 4.6, fromNose: 12.0, length: 3.8, diameter: 1.6 }],
    },
  },

  narrowbodyTwin: {
    id: 'narrowbodyTwin',
    label: 'Narrow-body twin',
    reference: 'Airbus A320',
    referenceLength: 37.6,
    referenceSpan: 35.8,
    planform: {
      fuselage: {
        length: 37.6,
        width: 3.95,
        noseLength: 4.5,
        tailConeLength: 9.5,
        tailTipWidth: 0.6,
        noseShape: 'rounded',
      },
      wing: {
        span: 35.8,
        rootChord: 7.0,
        tipChord: 1.6,
        leadingEdgeSweepDeg: 27,
        rootLeadingEdgeFromNose: 13.0,
        trailingEdgeKinkFraction: 0.33,
      },
      tailplane: {
        span: 12.5,
        rootChord: 3.6,
        tipChord: 1.4,
        leadingEdgeSweepDeg: 32,
        rootLeadingEdgeFromNose: 31.0,
      },
      engines: [{ lateralOffset: 5.75, fromNose: 11.0, length: 4.6, diameter: 2.2 }],
    },
  },

  narrowbodyQuad: {
    id: 'narrowbodyQuad',
    label: 'Four-engine narrow-body',
    reference: 'Boeing KC-135 / RC-135',
    referenceLength: 41.5,
    referenceSpan: 39.9,
    planform: {
      fuselage: {
        length: 41.5,
        width: 3.7,
        noseLength: 4.3,
        tailConeLength: 10.0,
        tailTipWidth: 0.6,
        noseShape: 'rounded',
      },
      wing: {
        span: 39.9,
        rootChord: 8.5,
        tipChord: 2.2,
        leadingEdgeSweepDeg: 37,
        rootLeadingEdgeFromNose: 13.0,
        trailingEdgeKinkFraction: 0.28,
      },
      tailplane: {
        span: 12.7,
        rootChord: 4.2,
        tipChord: 1.5,
        leadingEdgeSweepDeg: 37,
        rootLeadingEdgeFromNose: 34.6,
      },
      engines: [
        { lateralOffset: 6.8, fromNose: 13.2, length: 4.6, diameter: 1.6 },
        { lateralOffset: 12.2, fromNose: 17.6, length: 4.6, diameter: 1.6 },
      ],
    },
  },

  widebodyTwin: {
    id: 'widebodyTwin',
    label: 'Wide-body twin',
    reference: 'Airbus A330-300',
    referenceLength: 63.7,
    referenceSpan: 60.3,
    planform: {
      fuselage: {
        length: 63.7,
        width: 5.64,
        noseLength: 6.5,
        tailConeLength: 15.0,
        tailTipWidth: 0.9,
        noseShape: 'rounded',
      },
      wing: {
        span: 60.3,
        rootChord: 11.5,
        tipChord: 2.5,
        leadingEdgeSweepDeg: 31,
        rootLeadingEdgeFromNose: 22.5,
        trailingEdgeKinkFraction: 0.3,
      },
      tailplane: {
        span: 19.4,
        rootChord: 6.0,
        tipChord: 2.2,
        leadingEdgeSweepDeg: 34,
        rootLeadingEdgeFromNose: 52.5,
      },
      engines: [{ lateralOffset: 10.0, fromNose: 19.0, length: 6.8, diameter: 3.4 }],
    },
  },

  widebodyQuad: {
    id: 'widebodyQuad',
    label: 'Four-engine wide-body',
    reference: 'Boeing 747-400',
    referenceLength: 70.7,
    referenceSpan: 64.4,
    planform: {
      fuselage: {
        length: 70.7,
        width: 6.5,
        noseLength: 7.5,
        tailConeLength: 16.0,
        tailTipWidth: 1.0,
        noseShape: 'rounded',
      },
      wing: {
        span: 64.4,
        rootChord: 14.0,
        tipChord: 3.0,
        leadingEdgeSweepDeg: 40,
        rootLeadingEdgeFromNose: 22.0,
        trailingEdgeKinkFraction: 0.28,
      },
      tailplane: {
        span: 22.2,
        rootChord: 7.0,
        tipChord: 2.5,
        leadingEdgeSweepDeg: 38,
        rootLeadingEdgeFromNose: 58.0,
      },
      engines: [
        { lateralOffset: 11.9, fromNose: 25.4, length: 6.0, diameter: 2.7 },
        { lateralOffset: 21.0, fromNose: 33.4, length: 6.0, diameter: 2.7 },
      ],
    },
  },

  trijet: {
    id: 'trijet',
    label: 'Three-engine jet',
    reference: 'McDonnell Douglas MD-11',
    referenceLength: 61.6,
    referenceSpan: 51.7,
    planform: {
      fuselage: {
        length: 61.6,
        width: 6.0,
        noseLength: 6.5,
        tailConeLength: 13.5,
        tailTipWidth: 1.6,
        noseShape: 'rounded',
      },
      wing: {
        span: 51.7,
        rootChord: 10.5,
        tipChord: 2.3,
        leadingEdgeSweepDeg: 37,
        rootLeadingEdgeFromNose: 22.0,
        trailingEdgeKinkFraction: 0.3,
      },
      tailplane: {
        span: 18.0,
        rootChord: 5.5,
        tipChord: 2.0,
        leadingEdgeSweepDeg: 40,
        rootLeadingEdgeFromNose: 52.0,
      },
      engines: [
        { lateralOffset: 8.7, fromNose: 21.6, length: 6.2, diameter: 3.0 },
        // The tail engine sits on top of the rear fuselage, so from above its
        // nacelle shows as a bulge wider than the tail cone around it.
        { lateralOffset: 0, fromNose: 54.5, length: 8.0, diameter: 3.6 },
      ],
    },
  },

  militaryTransportJet: {
    id: 'militaryTransportJet',
    label: 'Military transport jet',
    reference: 'Boeing C-17 Globemaster III',
    referenceLength: 53.0,
    referenceSpan: 51.7,
    planform: {
      fuselage: {
        length: 53.0,
        width: 6.85,
        noseLength: 6.0,
        tailConeLength: 14.0,
        tailTipWidth: 2.0,
        noseShape: 'rounded',
      },
      wing: {
        span: 51.7,
        rootChord: 10.0,
        tipChord: 3.2,
        leadingEdgeSweepDeg: 28,
        rootLeadingEdgeFromNose: 17.5,
      },
      tailplane: {
        span: 19.8,
        rootChord: 5.5,
        tipChord: 2.5,
        leadingEdgeSweepDeg: 32,
        rootLeadingEdgeFromNose: 45.0,
      },
      engines: [
        { lateralOffset: 7.4, fromNose: 15.2, length: 5.6, diameter: 2.4 },
        { lateralOffset: 14.3, fromNose: 18.6, length: 5.6, diameter: 2.4 },
      ],
    },
  },

  awacs: {
    id: 'awacs',
    label: 'Airborne early warning (rotodome)',
    reference: 'Boeing E-3 Sentry',
    referenceLength: 46.6,
    referenceSpan: 44.4,
    planform: {
      fuselage: {
        length: 46.6,
        width: 3.76,
        noseLength: 4.5,
        tailConeLength: 11.0,
        tailTipWidth: 0.6,
        noseShape: 'rounded',
      },
      wing: {
        span: 44.4,
        rootChord: 9.0,
        tipChord: 2.4,
        leadingEdgeSweepDeg: 37,
        rootLeadingEdgeFromNose: 15.0,
        trailingEdgeKinkFraction: 0.28,
      },
      tailplane: {
        span: 13.9,
        rootChord: 4.6,
        tipChord: 1.6,
        leadingEdgeSweepDeg: 37,
        rootLeadingEdgeFromNose: 39.2,
      },
      engines: [
        { lateralOffset: 7.5, fromNose: 15.8, length: 4.8, diameter: 1.7 },
        { lateralOffset: 13.5, fromNose: 20.4, length: 4.8, diameter: 1.7 },
      ],
      // The rotodome sits on struts above the rear fuselage; from above it
      // hides the fuselage under it, which is exactly how it is recognised.
      discs: [{ diameter: 9.1, centreFromNose: 31.5 }],
    },
  },

  fighterSingleFin: {
    id: 'fighterSingleFin',
    label: 'Fighter / fast jet',
    reference: 'General Dynamics F-16',
    referenceLength: 15.1,
    referenceSpan: 9.96,
    planform: {
      fuselage: {
        length: 15.1,
        width: 1.7,
        noseLength: 4.6,
        tailConeLength: 2.2,
        tailTipWidth: 1.0,
        noseShape: 'pointed',
      },
      // Root chord includes the leading-edge strake that blends the wing into
      // the forward fuselage; it is what gives the F-16 its arrowhead look.
      wing: {
        span: 9.96,
        rootChord: 7.6,
        tipChord: 1.0,
        leadingEdgeSweepDeg: 40,
        rootLeadingEdgeFromNose: 5.4,
      },
      tailplane: {
        span: 5.6,
        rootChord: 2.6,
        tipChord: 0.9,
        leadingEdgeSweepDeg: 40,
        rootLeadingEdgeFromNose: 12.1,
      },
    },
  },

  fighterTwinFin: {
    id: 'fighterTwinFin',
    label: 'Twin-fin fighter',
    reference: 'McDonnell Douglas F-15',
    referenceLength: 19.4,
    referenceSpan: 13.05,
    planform: {
      fuselage: {
        length: 19.4,
        width: 3.0,
        noseLength: 5.6,
        tailConeLength: 2.0,
        tailTipWidth: 2.4,
        noseShape: 'pointed',
      },
      wing: {
        span: 13.05,
        rootChord: 7.5,
        tipChord: 1.6,
        leadingEdgeSweepDeg: 45,
        rootLeadingEdgeFromNose: 8.0,
      },
      tailplane: {
        span: 8.6,
        rootChord: 3.0,
        tipChord: 1.2,
        leadingEdgeSweepDeg: 35,
        rootLeadingEdgeFromNose: 15.4,
      },
      fins: [{ lateralOffset: 1.55, fromNose: 14.6, length: 4.0, thickness: 0.35 }],
    },
  },

  fighterCanardDelta: {
    id: 'fighterCanardDelta',
    label: 'Canard-delta fighter',
    reference: 'Eurofighter Typhoon',
    referenceLength: 15.96,
    referenceSpan: 10.95,
    planform: {
      fuselage: {
        length: 15.96,
        width: 1.9,
        noseLength: 4.8,
        tailConeLength: 1.2,
        tailTipWidth: 1.4,
        noseShape: 'pointed',
      },
      wing: {
        span: 10.95,
        rootChord: 8.6,
        tipChord: 0.9,
        leadingEdgeSweepDeg: 53,
        rootLeadingEdgeFromNose: 6.8,
      },
      canard: {
        span: 4.4,
        rootChord: 1.6,
        tipChord: 0.6,
        leadingEdgeSweepDeg: 50,
        rootLeadingEdgeFromNose: 3.6,
      },
    },
  },

  hawkTrainer: {
    id: 'hawkTrainer',
    label: 'Hawk jet trainer',
    reference: 'BAE Systems Hawk',
    referenceLength: 12.4,
    referenceSpan: 9.4,
    planform: {
      fuselage: {
        length: 12.4,
        width: 1.5,
        noseLength: 3.4,
        tailConeLength: 3.6,
        tailTipWidth: 0.7,
        noseShape: 'pointed',
      },
      // Far less sweep than a fighter, with a nearly straight trailing edge:
      // this and the small tail are what separate a Hawk from an F-16 at icon size.
      wing: {
        span: 9.4,
        rootChord: 3.2,
        tipChord: 1.0,
        leadingEdgeSweepDeg: 28,
        rootLeadingEdgeFromNose: 5.4,
      },
      tailplane: {
        span: 4.4,
        rootChord: 1.7,
        tipChord: 0.5,
        leadingEdgeSweepDeg: 35,
        rootLeadingEdgeFromNose: 10.3,
      },
      // The intake shoulders either side of the fuselage, ahead of the wing.
      engines: [{ lateralOffset: 0.8, fromNose: 4.4, length: 3.0, diameter: 0.8 }],
    },
  },

  f35Lightning: {
    id: 'f35Lightning',
    label: 'F-35 Lightning II',
    reference: 'Lockheed Martin F-35A',
    referenceLength: 15.7,
    referenceSpan: 10.7,
    planform: {
      fuselage: {
        length: 15.2,
        width: 1.9,
        noseLength: 3.8,
        tailConeLength: 3.2,
        tailTipWidth: 1.1,
        noseShape: 'pointed',
      },
      // A trapezoid whose trailing edge sweeps forward, unlike the other
      // fighters: with the wide body it gives the F-35 its diamond outline.
      wing: {
        span: 10.7,
        rootChord: 7.2,
        tipChord: 1.5,
        leadingEdgeSweepDeg: 33,
        rootLeadingEdgeFromNose: 6.5,
      },
      tailplane: {
        span: 7.2,
        rootChord: 2.8,
        tipChord: 0.6,
        leadingEdgeSweepDeg: 26,
        rootLeadingEdgeFromNose: 12.9,
      },
      // Stands in for the wide intake and engine bay behind the narrow forebody.
      engines: [{ lateralOffset: 1.0, fromNose: 3.8, length: 8.0, diameter: 1.5 }],
    },
  },

  helicopter: {
    id: 'helicopter',
    label: 'Helicopter',
    reference: 'AgustaWestland AW139',
    referenceLength: 16.7,
    referenceSpan: 13.8,
    planform: {
      fuselage: {
        length: 13.8,
        width: 2.2,
        noseLength: 2.0,
        tailConeLength: 8.0,
        tailTipWidth: 0.4,
        noseShape: 'rounded',
      },
      tailplane: {
        span: 2.6,
        rootChord: 0.7,
        tipChord: 0.6,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 11.4,
      },
      // The tail rotor turns in a vertical plane, so from above it is a strip.
      fins: [{ lateralOffset: 0.5, fromNose: 12.3, length: 2.7, thickness: 0.2 }],
      rotors: [
        {
          diameter: 13.8,
          bladeCount: 5,
          bladeChord: 0.9,
          hubFromNose: 4.6,
          lateralOffset: 0,
          bladeAngleOffsetDeg: 0,
        },
      ],
    },
  },

  helicopterTandem: {
    id: 'helicopterTandem',
    label: 'Tandem-rotor helicopter',
    reference: 'Boeing CH-47 Chinook',
    referenceLength: 30.1,
    referenceSpan: 18.3,
    planform: {
      fuselage: {
        length: 15.9,
        width: 3.8,
        noseLength: 2.0,
        tailConeLength: 1.0,
        tailTipWidth: 3.0,
        noseShape: 'blunt',
      },
      rotors: [
        {
          diameter: 18.3,
          bladeCount: 3,
          bladeChord: 1.1,
          hubFromNose: 2.0,
          lateralOffset: 0,
          bladeAngleOffsetDeg: 0,
        },
        {
          diameter: 18.3,
          bladeCount: 3,
          bladeChord: 1.1,
          hubFromNose: 13.9,
          lateralOffset: 0,
          // Offset so the two discs' blades interleave rather than stack.
          bladeAngleOffsetDeg: 60,
        },
      ],
    },
  },

  tiltrotor: {
    id: 'tiltrotor',
    label: 'Tilt-rotor',
    reference: 'Bell Boeing V-22 Osprey',
    referenceLength: 17.5,
    referenceSpan: 25.8,
    planform: {
      fuselage: {
        length: 17.5,
        width: 2.6,
        noseLength: 3.0,
        tailConeLength: 4.0,
        tailTipWidth: 1.4,
        noseShape: 'rounded',
      },
      wing: {
        span: 14.2,
        rootChord: 3.0,
        tipChord: 3.0,
        leadingEdgeSweepDeg: -6,
        rootLeadingEdgeFromNose: 7.3,
      },
      tailplane: {
        span: 5.6,
        rootChord: 1.7,
        tipChord: 1.7,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 15.4,
      },
      fins: [{ lateralOffset: 2.8, fromNose: 15.1, length: 2.3, thickness: 0.3 }],
      engines: [{ lateralOffset: 7.1, fromNose: 6.0, length: 5.2, diameter: 1.6 }],
      rotors: [
        {
          diameter: 11.6,
          bladeCount: 3,
          bladeChord: 0.9,
          hubFromNose: 6.3,
          lateralOffset: 7.1,
          bladeAngleOffsetDeg: 15,
        },
      ],
    },
  },

  gyrocopter: {
    id: 'gyrocopter',
    label: 'Gyrocopter',
    reference: 'Magni M16',
    referenceLength: 8.4,
    referenceSpan: 8.4,
    planform: {
      fuselage: {
        length: 4.6,
        width: 0.9,
        noseLength: 1.0,
        tailConeLength: 2.0,
        tailTipWidth: 0.3,
        noseShape: 'rounded',
      },
      tailplane: {
        span: 1.6,
        rootChord: 0.5,
        tipChord: 0.5,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 3.9,
      },
      engines: [
        {
          lateralOffset: 0,
          fromNose: 2.9,
          length: 0,
          diameter: 0,
          propellerDiameter: 1.7,
          pusher: true,
        },
      ],
      rotors: [
        {
          diameter: 8.4,
          bladeCount: 2,
          bladeChord: 0.45,
          hubFromNose: 2.0,
          lateralOffset: 0,
          bladeAngleOffsetDeg: 60,
        },
      ],
    },
  },

  glider: {
    id: 'glider',
    label: 'Glider',
    reference: 'Schleicher ASK 21',
    referenceLength: 8.35,
    referenceSpan: 17.0,
    planform: {
      fuselage: {
        length: 8.35,
        width: 0.75,
        noseLength: 1.6,
        tailConeLength: 5.0,
        tailTipWidth: 0.15,
        noseShape: 'rounded',
      },
      wing: {
        span: 17.0,
        rootChord: 1.4,
        tipChord: 0.5,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 2.6,
      },
      tailplane: {
        span: 3.0,
        rootChord: 0.75,
        tipChord: 0.45,
        leadingEdgeSweepDeg: 8,
        rootLeadingEdgeFromNose: 7.5,
      },
    },
  },

  microlight: {
    id: 'microlight',
    label: 'Microlight',
    reference: 'Ikarus C42',
    referenceLength: 6.3,
    referenceSpan: 9.5,
    planform: {
      fuselage: {
        length: 6.3,
        width: 1.2,
        noseLength: 0.9,
        tailConeLength: 3.0,
        tailTipWidth: 0.2,
        noseShape: 'blunt',
      },
      wing: {
        span: 9.5,
        rootChord: 1.5,
        tipChord: 1.3,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 1.5,
      },
      tailplane: {
        span: 2.8,
        rootChord: 0.9,
        tipChord: 0.6,
        leadingEdgeSweepDeg: 10,
        rootLeadingEdgeFromNose: 5.4,
      },
      engines: [{ lateralOffset: 0, fromNose: 0, length: 0, diameter: 0, propellerDiameter: 1.7 }],
    },
  },

  balloon: {
    id: 'balloon',
    label: 'Balloon',
    reference: 'Hot-air balloon',
    referenceLength: 19.2,
    referenceSpan: 18.0,
    // Drawn in side view — envelope tapering to a basket — rather than from
    // above: seen from above a balloon is a plain disc, and a filled disc is
    // already Sentinel's symbol for a ground tower.
    fixedOrientation: true,
    planform: {
      fuselage: {
        length: 16.0,
        width: 18.0,
        noseLength: 9.0,
        tailConeLength: 7.0,
        tailTipWidth: 3.0,
        noseShape: 'rounded',
      },
      fins: [{ lateralOffset: 0, fromNose: 16.8, length: 2.4, thickness: 2.8 }],
    },
  },

  airship: {
    id: 'airship',
    label: 'Airship',
    reference: 'Zeppelin NT',
    referenceLength: 75.1,
    referenceSpan: 19.5,
    planform: {
      fuselage: {
        length: 75.1,
        width: 14.2,
        noseLength: 25.0,
        tailConeLength: 30.0,
        tailTipWidth: 1.5,
        noseShape: 'rounded',
      },
      tailplane: {
        span: 19.5,
        rootChord: 8.0,
        tipChord: 5.0,
        leadingEdgeSweepDeg: 30,
        rootLeadingEdgeFromNose: 60.0,
      },
    },
  },

  uav: {
    id: 'uav',
    label: 'Drone (fixed-wing)',
    reference: 'General Atomics MQ-9 Reaper',
    referenceLength: 11.0,
    referenceSpan: 20.1,
    planform: {
      fuselage: {
        length: 11.0,
        width: 1.0,
        noseLength: 2.5,
        tailConeLength: 4.0,
        tailTipWidth: 0.4,
        noseShape: 'rounded',
      },
      wing: {
        span: 20.1,
        rootChord: 1.4,
        tipChord: 0.6,
        leadingEdgeSweepDeg: 0,
        rootLeadingEdgeFromNose: 4.0,
      },
      // A V-tail; from above its two surfaces read as a short swept tailplane.
      tailplane: {
        span: 4.0,
        rootChord: 1.0,
        tipChord: 0.6,
        leadingEdgeSweepDeg: 25,
        rootLeadingEdgeFromNose: 9.2,
      },
      engines: [
        {
          lateralOffset: 0,
          fromNose: 11.0,
          length: 0,
          diameter: 0,
          propellerDiameter: 2.8,
          pusher: true,
        },
      ],
    },
  },
}
