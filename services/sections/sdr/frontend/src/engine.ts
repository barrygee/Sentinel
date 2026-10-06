/**
 * The SDR engine entry: the persistent radio pane (`SdrTabPanel` → `SdrPanel`)
 * and, through it, the AudioContext, worklet and IQ/decode sockets it owns.
 *
 * Loaded separately from `./register` (`section.ts` hands the shell a loader
 * for it), so the code the shell must have before it mounts stays small and a
 * slow sdr remote delays only the radio pane, not the app (plan §3.5). The
 * pane attaches the engine to the `radio` capability when it mounts; calls
 * made before then are queued (`attachRadioEngine`).
 */
export { default } from './SdrTabPanel.vue'
