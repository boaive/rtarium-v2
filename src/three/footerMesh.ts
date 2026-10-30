import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createYarnMaterial, prepareYarnTextures } from './mesh/yarnMaterial'

/**
 * The footer's piece of mesh: the real RTARIUM, the same Blender cell and the same yarn material
 * as the 3D on the rest of the page, instanced into a small piece cut to an irregular outline, so
 * its edge steps and frays the way a cut piece does. The mesh never changes; the piece as a whole
 * bends while it moves (a saddle opening along its way, a cup, a twist when it turns, a ripple
 * running through it) and stretches along its way, and with nothing moving it lies flat and true.
 *
 * Drawn on its own transparent canvas over the footer's liquid; one CSS pixel is one unit at z = 0,
 * so the piece sits exactly under the pointer.
 */

const CELL_URL = '/models/rtarium-cell-t10.glb'
const TEXTURES = ['/textures/yarn_basecolor.webp', '/textures/yarn_normal.webp', '/textures/yarn_roughness.webp']
/** grid pitch of the cell (m) and the piece's radius, in cells */
const PITCH = 0.012
const CELLS = 4.6
const RADIUS = CELLS * PITCH
/** the basalt, as on the yellow screens */
const FACE = new THREE.Color('#a07a55')
const PILE = new THREE.Color('#4a3322')
/** how far the piece is tipped back from the screen (rad) */
const TILT = 1.0

/** the bend, in the sheet's own frame (its plane is x-z, its depth y), normalised to the piece's radius */
const BEND = /* glsl */ `
uniform vec2 uDir;
uniform float uSaddle;
uniform float uCup;
uniform float uTwist;
uniform float uRipple;
uniform float uStretch;
uniform float uTime;
uniform float uInvR;
vec3 rtBend(vec3 p) {
  vec2 e = vec2(-uDir.y, uDir.x);
  vec2 q = p.xz * uInvR;
  float a = dot(q, uDir);
  float b = dot(q, e);
  float r2 = a * a + b * b;
  float y = p.y * uInvR + uSaddle * (a * a - b * b) + uCup * r2 + uRipple * sin(a * 4.5 - uTime * 6.0) * r2;
  float ang = uTwist * a;
  float c = cos(ang);
  float s = sin(ang);
  float b2 = b * c - y * s;
  float y2 = b * s + y * c;
  vec2 xz = a * uStretch * uDir + b2 / sqrt(uStretch) * e;
  return vec3(xz.x, y2, xz.y) / uInvR;
}
`

function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** the cut: an irregular outline, and each cell along it kept or not a little at random */
function cells() {
  const rnd = random(23)
  const outline = (a: number) => 1 + 0.12 * Math.sin(3 * a + 0.7) + 0.08 * Math.sin(5 * a - 1.3) + 0.05 * Math.sin(7 * a + 2.1)
  const out: [number, number][] = []
  const n = Math.ceil(CELLS) + 2
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const r = Math.hypot(i, j) / CELLS
      const edge = outline(Math.atan2(j, i))
      if (r < edge - 0.12 || (r < edge + 0.1 && rnd() < 0.55)) out.push([i, j])
    }
  }
  return out
}

export interface FooterMeshState {
  /** where the piece is (CSS px in the canvas), its radius (CSS px) */
  x: number
  y: number
  radius: number
  /** which way it moves (unit, screen axes) and how it is turned about its own face (rad) */
  dirX: number
  dirY: number
  spin: number
  /** how it bends and stretches: all 0 (stretch 1) at rest */
  saddle: number
  cup: number
  twist: number
  ripple: number
  stretch: number
  time: number
}

export function createFooterMesh(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  scene.environmentIntensity = 0.85
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 8000)
  const key = new THREE.DirectionalLight('#fff6e8', 2.4)
  key.position.set(-0.5, 1, 0.8)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#ffcf6a', 1.1)
  rim.position.set(0.9, -0.2, 0.5)
  scene.add(rim)

  const bend = {
    uDir: { value: new THREE.Vector2(1, 0) },
    uSaddle: { value: 0 },
    uCup: { value: 0 },
    uTwist: { value: 0 },
    uRipple: { value: 0 },
    uStretch: { value: 1 },
    uTime: { value: 0 },
    uInvR: { value: 1 / RADIUS },
  }

  // the piece lies in its own x-z plane; the holder tips it towards the viewer and places it
  const holder = new THREE.Group()
  const turn = new THREE.Group()
  holder.add(turn)
  scene.add(holder)

  let piece: THREE.InstancedMesh | null = null
  const owned: { dispose: () => void }[] = []

  const loader = new GLTFLoader()
  const tex = new THREE.TextureLoader()
  Promise.all([loader.loadAsync(CELL_URL), ...TEXTURES.map((u) => tex.loadAsync(u))])
    .then(([gltf, map, normalMap, roughnessMap]) => {
      let geometry: THREE.BufferGeometry | null = null
      ;(gltf as { scene: THREE.Object3D }).scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && m.name.endsWith('_hi')) geometry = m.geometry
      })
      if (!geometry) throw new Error('RTARIUM cell missing')
      const g = geometry as THREE.BufferGeometry
      // custom glTF attributes arrive lower-cased; the yarn material reads them under these names
      if (!g.getAttribute('aAo')) {
        g.setAttribute('aAo', g.getAttribute('_ao'))
        g.setAttribute('aPart', g.getAttribute('_part'))
        g.setAttribute('aYarn', g.getAttribute('_yarn'))
      }
      const textures = prepareYarnTextures(
        { map: map as THREE.Texture, normalMap: normalMap as THREE.Texture, roughnessMap: roughnessMap as THREE.Texture },
        Math.min(8, renderer.capabilities.getMaxAnisotropy()),
      )
      const yarn = createYarnMaterial({ textures })
      yarn.uniforms.uFaceColor.value.copy(FACE)
      yarn.uniforms.uPileColor.value.copy(PILE)
      yarn.uniforms.uWin.value.set(1000, 1000)
      // the bend goes on after the yarn material's own shaping, in the same sheet frame
      const shape = yarn.material.onBeforeCompile
      yarn.material.onBeforeCompile = (shader, r) => {
        shape.call(yarn.material, shader, r)
        Object.assign(shader.uniforms, bend)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${BEND}`)
          .replace('objectNormal = rtN;', 'objectNormal = normalize(rtBend(rtP + rtN * 0.0006) - rtBend(rtP));')
          .replace('transformed = rtP - rtOrigin();', 'transformed = rtBend(rtP) - rtOrigin();')
      }
      yarn.material.customProgramCacheKey = () => 'rtarium-footer-yarn'

      const list = cells()
      const mesh = new THREE.InstancedMesh(g, yarn.material, list.length)
      const m = new THREE.Matrix4()
      list.forEach(([i, j], k) => mesh.setMatrixAt(k, m.makeTranslation(i * PITCH, 0, j * PITCH)))
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = false
      turn.add(mesh)
      piece = mesh
      owned.push(g, yarn.material, yarn.depthMaterial, textures.map, textures.normalMap, textures.roughnessMap)
    })
    .catch((e) => console.warn('[RTARIUM] footer mesh unavailable', e))

  let width = 1
  let height = 1
  const resize = (w: number, h: number, dpr: number) => {
    width = w
    height = h
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.position.set(0, 0, h / 2 / Math.tan(THREE.MathUtils.degToRad(15)))
    camera.far = camera.position.z * 3
    camera.updateProjectionMatrix()
  }

  const v = new THREE.Vector2()
  const origin = new THREE.Vector2()
  const render = (s: FooterMeshState) => {
    if (!piece) {
      renderer.clear()
      return
    }
    holder.position.set(s.x - width / 2, height / 2 - s.y, 0)
    holder.scale.setScalar(Math.max(1e-4, s.radius / RADIUS))
    holder.rotation.set(TILT + 0.1 * Math.sin(s.time * 0.6), 0.14 * Math.sin(s.time * 0.45), 0)
    turn.rotation.y = s.spin
    // the way it moves, in the sheet's own frame: tipped with the holder, turned with the piece
    v.set(s.dirX, s.dirY * Math.sin(TILT)).rotateAround(origin, s.spin)
    if (v.lengthSq() > 1e-6) bend.uDir.value.copy(v.normalize())
    bend.uSaddle.value = s.saddle
    bend.uCup.value = s.cup
    bend.uTwist.value = s.twist
    bend.uRipple.value = s.ripple
    bend.uStretch.value = s.stretch
    bend.uTime.value = s.time
    renderer.render(scene, camera)
  }

  const dispose = () => {
    for (const o of owned) o.dispose()
    env.dispose()
    pmrem.dispose()
    renderer.dispose()
  }

  return { resize, render, dispose }
}
