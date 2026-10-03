import { registerSettingItems, registerSettingsSection } from '@/shell/settingsRegistry'
import OnlineSourceControl from '@/components/shared/settings/OnlineSourceControl.vue'
import SeaAisKeyControl from '@/components/shared/settings/SeaAisKeyControl.vue'
import SeaAisSdrSourceControl from '@/components/shared/settings/SeaAisSdrSourceControl.vue'
import SeaCoverageAreaControl from '@/components/shared/settings/SeaCoverageAreaControl.vue'
import SeaLabelFieldsControl from '@/components/shared/settings/SeaLabelFieldsControl.vue'
import SeaMapLayersControl from '@/components/shared/settings/SeaMapLayersControl.vue'
import SourceOverrideControl from '@/components/shared/settings/SourceOverrideControl.vue'

/**
 * SEA's Settings section (F3): AIS sources (AISStream or an SDR), the AISStream key and coverage area, map layers and vessel labels.
 */
registerSettingsSection({ key: 'sea', label: 'SEA', order: 30, domain: true })

registerSettingItems([
  {
    section: 'sea',
    sectionLabel: 'SEA',
    id: 'sea-source-override',
    label: 'Source Override',
    desc: 'Overrides the app-wide Connectivity Mode for this section',
    control: { component: SourceOverrideControl, props: { ns: 'sea' }, emits: ['stage'] },
    groupLabel: 'DATA SOURCES',
  },
  {
    section: 'sea',
    sectionLabel: 'SEA',
    id: 'sea-ais-sdr-source',
    label: 'Off Grid AIS SDR',
    desc: 'Which SDR radio receives AIS when the Sea map is off grid',
    searchTerms: 'ais sdr radio receiver off grid aivdm',
    control: { component: SeaAisSdrSourceControl, emits: ['stage'] },
    groupLabel: 'DATA SOURCES',
  },
  {
    section: 'sea',
    sectionLabel: 'SEA',
    id: 'sea-online-source',
    label: 'Online Data Source',
    desc: 'AISStream WebSocket URL for live vessel positions',
    searchTerms: 'ais aisstream vessels ships websocket',
    control: {
      component: OnlineSourceControl,
      props: { ns: 'sea', defaultUrl: 'wss://stream.aisstream.io/v0/stream' },
      emits: ['stage', 'commit'],
    },
    groupLabel: 'DATA SOURCES',
  },
  {
    section: 'sea',
    sectionLabel: 'SEA',
    id: 'sea-ais-key',
    label: 'AIS Data API Key',
    desc: '',
    searchTerms: 'ais aisstream api key secret token vessels ships',
    control: {
      component: SeaAisKeyControl,
      emits: ['stage', 'commit'],
      layout: 'half',
      naturalHeight: true,
    },
    groupLabel: 'DATA SOURCES',
  },
  {
    section: 'sea',
    sectionLabel: 'SEA',
    id: 'sea-coverage-area',
    label: 'Coverage Area',
    desc: 'The bounding box AIS covers. Worldwide is hundreds of messages a second — a regional box is lighter.',
    searchTerms: 'ais bounding box bbox region area subscription',
    control: {
      component: SeaCoverageAreaControl,
      emits: ['stage'],
      layout: 'half',
      naturalHeight: true,
    },
    groupLabel: 'DATA SOURCES',
  },
  {
    section: 'sea',
    sectionLabel: 'SEA',
    id: 'sea-map-layers',
    label: 'Map Layers',
    desc: 'Which overlays the Sea map draws. Changes show on the map at once; APPLY CHANGES saves them as the defaults for every device.',
    searchTerms: 'vessel labels range rings ferry routes ports harbours vhf overlays',
    control: {
      component: SeaMapLayersControl,
      emits: ['stage'],
      layout: 'half',
      naturalHeight: true,
    },
    groupLabel: 'MAP',
  },
  {
    section: 'sea',
    sectionLabel: 'SEA',
    id: 'sea-label-fields',
    label: 'Vessel Label Fields',
    desc: 'Which details each vessel shows on its map label',
    searchTerms: 'vessel label name type mmsi destination speed course',
    control: { component: SeaLabelFieldsControl, emits: ['stage'], layout: 'half' },
    groupLabel: 'LABELS',
  },
])
