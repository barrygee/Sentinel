import { h, type Component } from 'vue'
import type { RadioSiteHostEditor } from '@sentinel/shell-api/shell/radioSitesCapability'

/**
 * Stand-ins for the `radioSites` capability's host title row and add form,
 * for specs of the Radios card that can't load sdr-manager-remote. Each
 * renders a marker element naming what it was given, so a spec can find it.
 * Plain component objects, so this file defines no named component per se.
 */
const fakeHostHeader: Component = {
  name: 'FakeHostHeader',
  props: {
    host: { type: Object, required: true },
    expanded: Boolean,
    sdrCount: { type: Number, default: null },
    controlsId: { type: String, default: '' },
  },
  emits: ['stage', 'toggle'],
  render(this: { host: { id: number }; expanded: boolean }) {
    return h('div', {
      class: 'fake-host-header',
      'data-host-id': String(this.host.id),
      'data-expanded': String(this.expanded),
    })
  },
}

const fakeNewHostForm: Component = {
  name: 'FakeNewHostForm',
  emits: ['done'],
  render: () => h('div', { class: 'fake-new-host-form' }),
}

export const FAKE_HOST_EDITOR: RadioSiteHostEditor = {
  HostHeader: fakeHostHeader,
  NewHostForm: fakeNewHostForm,
}
