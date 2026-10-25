import * as THREE from 'three'

/**
 * Roving material for the RTARIUM cell geometry (ported from V1).
 *
 * LOOK. The rovings are a brushed metal with fine grooves along each yarn; the connecting fibres
 * are darker and much less metallic, as in the footage. Their colours are uniforms, so the same
 * mesh reads as dark ink on the yellow screens and as silver under gold light on the black ones.
 *
 * Per-vertex data baked by V1's blender/scripts/build_mesh.py:
 *   aAo    ambient occlusion against neighbouring yarns
 *   aPart  0 = upper face, 1 = lower face, 2 = connecting (pile) fibres
 *   aYarn  0 = flat weft roving, 1 = twisted warp strand, 2 = connecting fibre
 *
 * Also carried over from V1, the press: the sheet is stiff and springs back. A load (the cursor)
 * presses the upper face towards the lower one; once it moves on the sheet returns to its depth
 * (uFlexMap, see flex.ts). New: an x-ray look (uXray) for the technical screens, where the yarns
 * glow at their edges as if seen through concrete.
 *
 * The build: only the cells inside a window (uWin, in cells, centred on the sheet) are drawn. When
 * the window grows, the next rings of cells drop onto the sheet from the camera side, so the
 * opening can build the mesh out past the edges of the screen and the chapters can trim it back
 * to the one tile they explain.
 */
export interface YarnUniforms {
  uPartDim: THREE.IUniform<THREE.Vector3>
  uPartVis: THREE.IUniform<THREE.Vector3>
  uPartGlow: THREE.IUniform<THREE.Vector3>
  uGlowColor: THREE.IUniform<THREE.Color>
  uFaceColor: THREE.IUniform<THREE.Color>
  uPileColor: THREE.IUniform<THREE.Color>
  /** half-distance the faces are pulled apart (m) */
  uExplode: THREE.IUniform<number>
  uWave: THREE.IUniform<number>
  uAoStrength: THREE.IUniform<number>
  /** press depths from the cursor; r channel in metres, negative = pressed */
  uFlexMap: THREE.IUniform<THREE.Texture>
  /** 1 / (sheet size in x, z): maps sheet-local metres to the press field */
  uFlexScale: THREE.IUniform<THREE.Vector2>
  /** overall amount of press, 0..1 */
  uFlex: THREE.IUniform<number>
  /** x = height of the lower face (m), y = 1 / sheet depth (1/m) */
  uPressBand: THREE.IUniform<THREE.Vector2>
  /** yellow glow on pressed fibres, fading as they spring back */
  uPressGlow: THREE.IUniform<number>
  /** 0 = lit material, 1 = x-ray: dark body, glowing edges */
  uXray: THREE.IUniform<number>
  /** cells drawn, across the warp (x) and the weft (z), centred on the sheet */
  uWin: THREE.IUniform<THREE.Vector2>
  /** how many rings of cells are still landing at the edge of the window (≥ 0.5) */
  uBand: THREE.IUniform<number>
  /** height (m) a landing cell drops from */
  uLift: THREE.IUniform<number>
}

export interface YarnTextures {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
}

export interface YarnMaterialOptions {
  textures: YarnTextures
  /** cheaper shading for phones: no detail-normal pass */
  lite?: boolean
}

const VERTEX_PARS = /* glsl */ `
attribute float aAo;
attribute float aPart;
attribute float aYarn;
uniform float uExplode;
uniform float uWave;
uniform sampler2D uFlexMap;
uniform vec2 uFlexScale;
uniform float uFlex;
uniform vec2 uPressBand;
uniform vec2 uWin;
uniform float uBand;
uniform float uLift;
varying float vAo;
varying float vPart;
varying float vPress;
varying float vBuild;

vec3 rtOrigin() {
#ifdef USE_INSTANCING
  return instanceMatrix[3].xyz;
#else
  return vec3(0.0);
#endif
}

float rtHeight(vec2 xz) {
  return texture2D(uFlexMap, xz * uFlexScale + 0.5).r * uFlex;
}

void rtDeform(inout vec3 p, inout vec3 n) {
  // the build window: 1 = in place, 0 = not built yet; landing cells drop in from above
  vec3 rtO = rtOrigin();
  vec2 rtC = vec2(rtO.x / 0.012 + 0.5, rtO.z / 0.012);
  float rtE = min(uWin.x * 0.5 - abs(rtC.x), uWin.y * 0.5 - abs(rtC.y));
  vBuild = clamp(rtE / uBand, 0.0, 1.0);
  p.y += (1.0 - vBuild) * (1.0 - vBuild) * uLift;
  p.y += uExplode * (aPart < 0.5 ? 1.0 : (aPart < 1.5 ? -1.0 : 0.0));
  p.y += uWave * (sin(p.x * 21.0 + 1.3) * cos(p.z * 17.0 - 0.6) * 0.6
               + sin(p.x * 61.0 + p.z * 47.0) * 0.25
               + sin(p.z * 113.0 + p.x * 89.0) * 0.15);
  // press: the upper face goes most of the way, the lower face hardly at all
  vPress = 0.0;
  if (uFlex > 0.0001) {
    float w = mix(0.14, 1.0, clamp((p.y - uPressBand.x) * uPressBand.y, 0.0, 1.0));
    float h = rtHeight(p.xz);
#ifndef RT_DEPTH
    const float e = 0.004;
    float hx = (rtHeight(p.xz + vec2(e, 0.0)) - h) / e * w * 0.5;
    float hz = (rtHeight(p.xz + vec2(0.0, e)) - h) / e * w * 0.5;
    n = normalize(vec3(n.x - n.y * hx, n.y, n.z - n.y * hz));
#endif
    p.y += h * w;
    vPress = clamp(-h * uPressBand.y, 0.0, 1.0) * w;
  }
}
`

const VERTEX_NORMAL = /* glsl */ `
vec3 rtP = position + rtOrigin();
vec3 rtN = objectNormal;
rtDeform(rtP, rtN);
objectNormal = rtN;
vAo = aAo;
vPart = aPart;
`
const VERTEX_POSITION = /* glsl */ `
transformed = rtP - rtOrigin();
`
const VERTEX_DEPTH = /* glsl */ `
vec3 rtP = transformed + rtOrigin();
vec3 rtN = vec3(0.0, 1.0, 0.0);
rtDeform(rtP, rtN);
transformed = rtP - rtOrigin();
vAo = aAo;
vPart = aPart;
`

/** twisted strands and connecting fibres: slant the filaments so the yarn reads as twisted */
const VERTEX_UV = /* glsl */ `
float rtTwist = aYarn < 0.5 ? 0.0 : (aYarn < 1.5 ? 1.0 : 2.0);
#ifdef USE_MAP
  vMapUv.x += vMapUv.y * rtTwist;
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv.x += vNormalMapUv.y * rtTwist;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv.x += vRoughnessMapUv.y * rtTwist;
#endif
`

const FRAGMENT_PARS = /* glsl */ `
varying float vBuild;
uniform vec3 uPartDim;
uniform vec3 uPartVis;
uniform vec3 uPartGlow;
uniform vec3 uGlowColor;
uniform vec3 uFaceColor;
uniform vec3 uPileColor;
uniform float uAoStrength;
uniform float uPressGlow;
uniform float uXray;
varying float vAo;
varying float vPart;
varying float vPress;
float rtIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float rtPick(vec3 v) { return vPart < 0.5 ? v.x : (vPart < 1.5 ? v.y : v.z); }
`

const FRAGMENT_COLOR = /* glsl */ `
if (vBuild <= 0.0 || rtIgn(gl_FragCoord.xy + 17.0) > vBuild * 4.0) discard;
float rtVis = rtPick(uPartVis);
if (rtVis < 0.999 && rtIgn(gl_FragCoord.xy) >= rtVis) discard;
float rtPile = step(1.5, vPart);
diffuseColor.rgb *= mix(uFaceColor, uPileColor, rtPile) * rtPick(uPartDim);
diffuseColor.rgb *= 1.0 - 0.88 * uXray;
`

const FRAGMENT_ROUGHNESS = /* glsl */ `
roughnessFactor = max(roughnessFactor, 0.6 * smoothstep(0.1, 0.75, length(vViewPosition)));
roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.62), rtPile);
`
const FRAGMENT_METALNESS = /* glsl */ `
metalnessFactor *= mix(1.0, 0.25, rtPile);
`

const FRAGMENT_AO = /* glsl */ `
float rtAo = mix(1.0, vAo, uAoStrength);
reflectedLight.indirectDiffuse *= rtAo;
reflectedLight.indirectSpecular *= rtAo * rtAo * (1.0 - 0.8 * uXray);
reflectedLight.directDiffuse *= mix(1.0, rtAo, 0.5);
reflectedLight.directSpecular *= mix(1.0, rtAo, 0.6) * (1.0 - 0.8 * uXray);
`

const FRAGMENT_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
float rtRim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
totalEmissiveRadiance += uGlowColor * (rtPick(uPartGlow) + uPressGlow * vPress);
totalEmissiveRadiance += uGlowColor * uXray * (0.06 + 1.1 * rtRim * rtRim * rtRim) * mix(1.0, 1.3, rtPile);
`

let blank: THREE.DataTexture | null = null
/** zero height field for meshes that do not flex */
function blankFlexMap() {
  if (!blank) {
    blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat)
    blank.needsUpdate = true
  }
  return blank
}

export function createYarnUniforms(): YarnUniforms {
  return {
    uPartDim: { value: new THREE.Vector3(1, 1, 1) },
    uPartVis: { value: new THREE.Vector3(1, 1, 1) },
    uPartGlow: { value: new THREE.Vector3(0, 0, 0) },
    uGlowColor: { value: new THREE.Color('#fdd001') },
    uFaceColor: { value: new THREE.Color('#e9e7e3') },
    uPileColor: { value: new THREE.Color('#2a2724') },
    uExplode: { value: 0 },
    uWave: { value: 0.0006 },
    uAoStrength: { value: 0.9 },
    uFlexMap: { value: blankFlexMap() },
    uFlexScale: { value: new THREE.Vector2(1, 1) },
    uFlex: { value: 0 },
    uPressBand: { value: new THREE.Vector2(-0.0051, 1 / 0.0102) },
    uPressGlow: { value: 0 },
    uXray: { value: 0 },
    uWin: { value: new THREE.Vector2(18, 18) },
    uBand: { value: 0.5 },
    uLift: { value: 0.03 },
  }
}

export function createYarnMaterial(opts: YarnMaterialOptions) {
  const uniforms = createYarnUniforms()
  const { map, normalMap, roughnessMap } = opts.textures

  const material = new THREE.MeshPhysicalMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap,
    roughness: 1,
    metalness: 0.86,
    envMapIntensity: 1.25,
  })

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${VERTEX_UV}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${VERTEX_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_POSITION}`)
    let fragment = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAGMENT_ROUGHNESS}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${FRAGMENT_METALNESS}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${FRAGMENT_AO}`)
      .replace('#include <emissivemap_fragment>', FRAGMENT_EMISSIVE)
    if (!opts.lite) {
      // a second, finer sample of the groove normal so close-ups keep their brushed detail
      fragment = fragment.replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'mapN.xy *= normalScale;',
          `vec3 rtFine = texture2D( normalMap, vNormalMapUv * vec2( 3.0, 2.0 ) + 0.37 ).xyz * 2.0 - 1.0;
          mapN.xy = ( mapN.xy + rtFine.xy * 0.55 ) * normalScale;`,
        ),
      )
    }
    shader.fragmentShader = fragment
  }
  material.customProgramCacheKey = () => `rtarium-v3-yarn-${opts.lite ? 'lite' : 'full'}`

  // shadow pass with the same deformation and part visibility
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  depthMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#define RT_DEPTH\n#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_DEPTH}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uPartVis;\nvarying float vAo;\nvarying float vPart;\nvarying float vPress;
varying float vBuild;`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vBuild < 0.25) discard;
        float rtVis = vPart < 0.5 ? uPartVis.x : (vPart < 1.5 ? uPartVis.y : uPartVis.z);
        if (rtVis < 0.5) discard;`,
      )
  }
  depthMaterial.customProgramCacheKey = () => 'rtarium-v3-yarn-depth'

  return { material, depthMaterial, uniforms }
}

export function prepareYarnTextures(t: YarnTextures, anisotropy: number) {
  for (const tex of [t.map, t.normalMap, t.roughnessMap]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = anisotropy
    tex.needsUpdate = true
  }
  t.map.colorSpace = THREE.SRGBColorSpace
  t.normalMap.colorSpace = THREE.NoColorSpace
  t.roughnessMap.colorSpace = THREE.NoColorSpace
  return t
}
