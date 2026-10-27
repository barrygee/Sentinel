/**
 * Helpers for the THIS MACHINE component specs: the accessibility assertion
 * every spec makes, and a host that provides the DEVICES card's staged edits
 * the way `LocalDevicesControl` does, so a row or form can be mounted alone.
 */
import { defineComponent, h, reactive, type Component } from 'vue'
import { expect, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import { provideLocalDeviceEdits, type LocalDeviceEdits } from '../composables/useLocalDeviceEdits'

/** Assert the rendered markup has no axe violations (the page-level `region` rule needs a whole page). */
export async function expectNoAxeViolations(wrapper: VueWrapper): Promise<void> {
  expect(await axe(wrapper.html(), { rules: { region: { enabled: false } } })).toHaveNoViolations()
}

/** What `mountWithDeviceEdits` gives back. */
export interface DeviceEditsMount {
  wrapper: VueWrapper
  /** The wrapped component's own wrapper (props, emitted events). */
  child: VueWrapper
  /** The card's `stage` event handler: called with each APPLY CHANGES closure. */
  stage: ReturnType<typeof vi.fn>
  deviceEdits: LocalDeviceEdits
  /** Reactive props passed to the child: change a value to re-render it. */
  props: Record<string, unknown>
}

/** Mount `component` under a host that provides staged device edits, as the DEVICES card does. */
export function mountWithDeviceEdits(
  component: Component,
  initialProps: Record<string, unknown> = {},
  options: {
    attachToBody?: boolean
    /** Runs after the edits are provided and before the child renders (seed errors or drafts here). */
    prepare?: (deviceEdits: LocalDeviceEdits) => void
  } = {},
): DeviceEditsMount {
  const stage = vi.fn()
  const props = reactive({ ...initialProps })
  let deviceEdits: LocalDeviceEdits | undefined
  const Host = defineComponent({
    setup() {
      deviceEdits = provideLocalDeviceEdits(stage)
      options.prepare?.(deviceEdits)
      return () => h(component, props)
    },
  })
  const wrapper = mount(Host, { attachTo: options.attachToBody ? document.body : undefined })
  return {
    wrapper,
    child: wrapper.findComponent(component),
    stage,
    deviceEdits: deviceEdits!,
    props,
  }
}
