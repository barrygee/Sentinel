/**
 * The atmosphere: a thin back-facing shell just outside the globe whose blue
 * glow fades smoothly to nothing at its outer edge (additive, so it brightens
 * the stars and space behind the limb rather than covering them).
 */
import {
  AddEquation,
  BackSide,
  CustomBlending,
  Mesh,
  OneFactor,
  ShaderMaterial,
  SphereGeometry,
} from 'three'
import { GLOBE_RADIUS } from './geo'

/** The shell's radius as a multiple of the globe's. */
const SHELL_SCALE = 1.022

/** The atmosphere mesh. */
export function createAtmosphere(): Mesh {
  // The cosine at which a view ray grazes the shell's outer edge, so the glow
  // reaches zero exactly there.
  const edgeCosine = Math.sqrt(1 - 1 / (SHELL_SCALE * SHELL_SCALE)).toFixed(4)
  const material = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vToCamera;
      void main() {
        vNormal = normalMatrix * normal;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vToCamera = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vToCamera;
      void main() {
        float depth = clamp(-dot(normalize(vNormal), normalize(vToCamera)) / ${edgeCosine}, 0.0, 1.0);
        float strength = pow(depth, 1.8) * 0.42;
        gl_FragColor = vec4(vec3(0.42, 0.58, 1.0) * strength, strength * 0.8);
      }
    `,
  })
  return new Mesh(new SphereGeometry(GLOBE_RADIUS * SHELL_SCALE, 192, 96), material)
}
