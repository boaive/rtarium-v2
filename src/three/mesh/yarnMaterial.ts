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
 * the window grows, the next rings of cells are woven on: their yarns run out from the built sheet
 * across each cell, the upper face first, then the lower face, then the connecting fibres that bind
 * the two, the tip of each yarn lifted a little as it is laid (uWeave 1). When the window shrinks,
 * the cells it leaves lift away from the camera side and dissolve (uWeave 0), so the opening can
 * build the mesh out past the edges of the screen and the chapters can trim it back to the one
 * tile they explain. Cells wholly outside the window collapse to a point in the vertex shader, so
 * they cost no fragments.
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
  /** across the warp (x) and the weft (y): 1 while the window grows that way and its new cells are woven on, 0 while it shrinks and its cells lift away */
  uWeave: THREE.IUniform<THREE.Vector2>
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
uniform vec2 uWeave;
varying float vAo;
varying float vPart;
varying float vPress;
varying float vBuild;
varying float vWeave;
varying float vWeaving;

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
  // the build window: 1 = in place, 0 = not built yet
  vec3 rtO = rtOrigin();
  vec2 rtC = vec2(rtO.x / 0.012 + 0.5, rtO.z / 0.012);
  float rtEx = uWin.x * 0.5 - abs(rtC.x);
  float rtEz = uWin.y * 0.5 - abs(rtC.y);
  vBuild = clamp(min(rtEx, rtEz) / uBand, 0.0, 1.0);
  // weaving on: how far out across its cell this point lies, from the side facing the built sheet
  // (0) to the open side (1), along whichever edge of the window the cell is on; each part of the
  // mesh follows the one before it (upper face, lower face, then the fibres between them)
  vec2 rtU = vec2(0.5 + ((p.x - rtO.x) / 0.012 - 0.5) * sign(rtC.x), 0.5 + (p.z - rtO.z) / 0.012 * sign(rtC.y));
  float rtAxis = clamp(rtEz - rtEx + 0.5, 0.0, 1.0);
  float rtOut = mix(rtU.y, rtU.x, rtAxis);
  vWeaving = mix(uWeave.y, uWeave.x, rtAxis);
  float rtLag = aPart < 0.5 ? 0.0 : (aPart < 1.5 ? 0.25 : 0.5);
  vWeave = vBuild * 1.75 - rtLag - rtOut;
  // a landing cell drops in from above; a yarn being woven lifts its tip a little as it is laid
  float rtTip = 1.0 - smoothstep(0.0, 0.35, vWeave);
  p.y += mix((1.0 - vBuild) * (1.0 - vBuild) * uLift, rtTip * (1.0 - vBuild) * uLift * 0.1, vWeaving);
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
// a cell wholly outside the window collapses to a point: no fragments to shade and throw away
const VERTEX_POSITION = /* glsl */ `
transformed = vBuild > 0.0 ? rtP - rtOrigin() : vec3(0.0);
`
const VERTEX_DEPTH = /* glsl */ `
vec3 rtP = transformed + rtOrigin();
vec3 rtN = vec3(0.0, 1.0, 0.0);
rtDeform(rtP, rtN);
transformed = vBuild > 0.0 ? rtP - rtOrigin() : vec3(0.0);
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

/**
 * Whether a fragment of the build band is drawn: a landing cell dissolves in by its whole cell (a
 * dither), a cell being woven shows each yarn up to where it has been laid so far.
 */
const BUILD_KEEP = /* glsl */ `
varying float vBuild;
varying float vWeave;
varying float vWeaving;
bool rtBuilt(float dither) {
  if (vBuild <= 0.0) return false;
  float keep = mix(vBuild * 4.0, step(0.0, vWeave), vWeaving);
  return dither <= keep;
}
`

const FRAGMENT_PARS = /* glsl */ `
${BUILD_KEEP}
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
if (!rtBuilt(rtIgn(gl_FragCoord.xy + 17.0))) discard;
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
    uWeave: { value: new THREE.Vector2(1, 1) },
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
      .replace('#include <common>', `#include <common>\nuniform vec3 uPartVis;\nvarying float vAo;\nvarying float vPart;\nvarying float vPress;\n${BUILD_KEEP}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // the shadow follows the build: a dissolving cell casts once it is a quarter in
        if (!rtBuilt(0.999)) discard;
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
