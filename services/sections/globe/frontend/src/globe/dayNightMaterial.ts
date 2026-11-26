/**
 * The material every map layer of the globe uses: the texture, darkened on the
 * night side the way the app's flat maps shade night (a deep blue wash), with
 * a soft terminator.
 */
import { ShaderMaterial, Vector3, type IUniform, type Texture } from 'three'

/** A uniform holding the unit vector from the globe's centre towards the Sun. */
export type SunDirectionUniform = IUniform<Vector3>

/** A fresh sun uniform; one is shared by every layer so they shade together. */
export function createSunDirectionUniform(): SunDirectionUniform {
  return { value: new Vector3(1, 0, 0) }
}

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalDirection;
void main() {
  vUv = uv;
  vNormalDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// The night colour and strength are the site globe's: mix 62% toward a
// near-black blue, fading in over the terminator (sun 4° above to 16° below).
const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D map;
uniform vec3 sunDirection;
varying vec2 vUv;
varying vec3 vNormalDirection;
void main() {
  vec3 colour = texture2D(map, vUv).rgb;
  float sunHeight = dot(normalize(vNormalDirection), sunDirection);
  float night = 1.0 - smoothstep(-0.16, 0.04, sunHeight);
  colour = mix(colour, vec3(0.0012, 0.0016, 0.012), 0.62 * night);
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}
`

/**
 * A day/night shaded material for one texture.
 *
 * @param map the layer's texture (sRGB colour space).
 * @param sunDirection the shared sun uniform, updated once per frame.
 */
export function createDayNightMaterial(
  map: Texture | null,
  sunDirection: SunDirectionUniform,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { map: { value: map }, sunDirection },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })
}
