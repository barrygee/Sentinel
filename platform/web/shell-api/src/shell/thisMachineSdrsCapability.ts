import type { Component } from 'vue'

/**
 * The `thisMachineSdrs` capability (ADR 0007), provided by sdr-manager-local
 * in the full app: this machine's SDRs, managed where they are listed — in
 * Settings › SDR, inside the "This machine" host of SENTINEL HOSTS — so the
 * SDR section shows them without importing sdr-manager-local.
 */
export interface ThisMachineSdrsCapability {
  /**
   * This machine's SDR list: each SDR's state, name, address, stream switch
   * and settings, with the console password and warnings that concern them.
   * It emits `stage` with a closure that saves its staged edits (APPLY
   * CHANGES), and renders the scoped slot `device-actions` (`{ deviceId }`)
   * at the end of each SDR's row, where the SDR section puts ADD.
   */
  DevicesPanel: Component
}
