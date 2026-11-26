/**
 * Keyboard control of the globe, so it is fully usable without a pointer.
 */
import { ZOOM_STEP, type CameraController } from './cameraController'

/** Degrees one arrow-key press turns the globe (at the home zoom). */
const KEY_PAN_DEGREES = 5

/**
 * Keyboard control of the camera, for a focused globe: arrows turn it,
 * + and − zoom, Home (or 0) returns to the start view.
 *
 * @returns true when the key was handled (the caller prevents its default).
 */
export function handleGlobeKey(key: string, controller: CameraController): boolean {
  switch (key) {
    case 'ArrowUp':
      controller.panBy(KEY_PAN_DEGREES, 0)
      return true
    case 'ArrowDown':
      controller.panBy(-KEY_PAN_DEGREES, 0)
      return true
    case 'ArrowLeft':
      controller.panBy(0, -KEY_PAN_DEGREES)
      return true
    case 'ArrowRight':
      controller.panBy(0, KEY_PAN_DEGREES)
      return true
    case '+':
    case '=':
      controller.zoomBy(ZOOM_STEP)
      return true
    case '-':
    case '_':
      controller.zoomBy(1 / ZOOM_STEP)
      return true
    case 'Home':
    case '0':
      controller.goHome()
      return true
    default:
      return false
  }
}
