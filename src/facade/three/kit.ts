import * as THREE from 'three'
import { damp } from '../../lib/motion'

/**
 * Shared pieces of the façade scenes: materials, the camera shot, and the small amount of
 * bookkeeping that lets a scene render only while something is moving (the canvases run on
 * demand, see Stage3D).
 */

/** a camera shot: orbit about `target` (m, deg), the target placed at `frame` of the canvas (0..1 from top left) */
export interface Shot {
  target: [number, number, number]
  dist: number
  azim: number
  elev: number
  fov?: number
  frame?: [number, number]
}

/** labels and anchors shared between a scene (inside the canvas) and its DOM layer */
export interface LabelBus {
  anchors: Map<string, THREE.Object3D>
  els: Map<string, HTMLElement>
  /** the anchor each label points at, when it is not the label's own id */
  alias: Map<string, string>
  /** ids of the labels the current state shows */
  shown: Set<string>
}

export const createBus = (): LabelBus => ({ anchors: new Map(), els: new Map(), alias: new Map(), shown: new Set() })

/** moves `v` towards `to`; returns true while it is still on its way */
export function approach(obj: Record<string, number>, key: string, to: number, lambda: number, dt: number, eps = 1e-4) {
  const v = obj[key]
  if (Math.abs(v - to) <= eps) {
    obj[key] = to
    return false
  }
  obj[key] = damp(v, to, lambda, dt)
  return true
}

/** opacity for a set of materials; fully hidden ones stop drawing, translucent ones stop writing depth */
export function setOpacity(mats: THREE.Material[], o: number) {
  for (const m of mats) {
    const base = (m.userData.base as number | undefined) ?? 1
    m.opacity = base * o
    m.visible = o > 0.004
    m.depthWrite = !m.userData.glass && o > 0.97
  }
}

/* ---- materials ------------------------------------------------------------------------------- */

let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/** a fine, even grain for concrete and mineral wool, drawn once */
const grains = new Map<string, HTMLCanvasElement>()
export function grainTexture(base: string, dots: number, spread: [number, number], repeat = 3) {
  const key = `${base}|${dots}|${spread.join(',')}`
  let c = grains.get(key)
  if (!c) grains.set(key, (c = drawGrain(base, dots, spread)))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  return tex
}
function drawGrain(base: string, dots: number, spread: [number, number]) {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < dots; i++) {
    const v = spread[0] + rnd() * (spread[1] - spread[0])
    g.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.18 + rnd() * 0.4})`
    g.beginPath()
    g.arc(rnd() * size, rnd() * size, rnd() * 1.4 + 0.3, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

export const PITCH_M = 0.012

export interface FacadeMaterials {
  panel: THREE.MeshStandardMaterial
  slab: THREE.MeshStandardMaterial
  wall: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  darkSteel: THREE.MeshStandardMaterial
  lightGauge: THREE.MeshStandardMaterial
  alu: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  gasket: THREE.MeshStandardMaterial
  insulation: THREE.MeshStandardMaterial
  membrane: THREE.MeshStandardMaterial
  firestop: THREE.MeshStandardMaterial
  sealant: THREE.MeshStandardMaterial
  ink: THREE.MeshBasicMaterial
}

/**
 * One set of materials for a scene. Colours are the materials' own (grey concrete, galvanized
 * steel, anodized aluminium, mineral wool, red-oxide firestop), muted so the basalt bronze of the
 * mesh stays the warmest thing in the picture. Every material is transparent from the start so
 * fading a component never recompiles a shader.
 */
export function createMaterials(): FacadeMaterials {
  const concrete = grainTexture('#bdb8ae', 5200, [140, 220], 2)
  const wool = grainTexture('#b3aa95', 7000, [120, 200], 4)
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p })
  const glass = std({ color: '#9fb6c2', metalness: 0.15, roughness: 0.05, opacity: 0.34, envMapIntensity: 1.4 })
  glass.userData.base = 0.34
  glass.userData.glass = true
  const membrane = std({ color: '#5f6873', roughness: 0.6, opacity: 0.78, side: THREE.DoubleSide })
  membrane.userData.base = 0.78
  return {
    panel: std({ color: '#ddd8ce', map: concrete, roughness: 0.86 }),
    slab: std({ color: '#8b8780', map: concrete, roughness: 0.95 }),
    wall: std({ color: '#c2bcb1', map: concrete, roughness: 0.97 }),
    steel: std({ color: '#a7acb1', metalness: 0.62, roughness: 0.4 }),
    darkSteel: std({ color: '#686d73', metalness: 0.55, roughness: 0.45 }),
    lightGauge: std({ color: '#c9ccce', metalness: 0.55, roughness: 0.38 }),
    alu: std({ color: '#3a3d41', metalness: 0.5, roughness: 0.42 }),
    glass,
    gasket: std({ color: '#141414', roughness: 0.7 }),
    insulation: std({ color: '#c4bba6', map: wool, roughness: 1 }),
    membrane,
    firestop: std({ color: '#9a4430', roughness: 0.92 }),
    sealant: std({ color: '#2b2b2b', roughness: 0.55 }),
    ink: new THREE.MeshBasicMaterial({ color: '#080808', transparent: true, toneMapped: false }),
  }
}

/** a copy of a set, so one group of components can fade apart from the rest */
export function cloneMaterials(m: FacadeMaterials): FacadeMaterials {
  const out = {} as Record<string, THREE.Material>
  for (const [k, v] of Object.entries(m)) {
    const c = (v as THREE.Material).clone()
    c.userData = { ...(v as THREE.Material).userData }
    out[k] = c
  }
  return out as unknown as FacadeMaterials
}

export function disposeMaterials(m: FacadeMaterials) {
  const seen = new Set<THREE.Texture>()
  for (const v of Object.values(m) as THREE.Material[]) {
    const map = (v as THREE.MeshStandardMaterial).map
    if (map && !seen.has(map)) {
      seen.add(map)
      map.dispose()
    }
    v.dispose()
  }
}
