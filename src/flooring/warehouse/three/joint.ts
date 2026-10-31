import * as THREE from 'three'
import { block, merge } from '../../../facade/three/unit/parts'
import { uvBox } from '../../data/three/dc'

/**
 * A traditional screed with a saw-cut joint across it (along x, at z = 0): the surface as a fine
 * height-field in three states, a wheel's whole story. The base shape is the sound cut; the first
 * morph target is the same joint after the rolling shear (its edges spalled away, the floor beside it
 * pitted); the second is the joint gone, the floor one flat plate. A scene moves between them with the
 * mesh's `morphTargetInfluences`. The grid is finest where the wheel runs, so a close-up holds.
 */

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}
/** smooth noise along one axis, -1..1 */
function noise(x: number) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1
}
const ss = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** grid coordinates over a..b, finest about c: u 0..1 */
function warp(u: number, a: number, b: number, c: number, k = 2.3) {
  const s = Math.sinh(k * (2 * u - 1)) / Math.sinh(k)
  return c + (s < 0 ? (c - a) * s : (b - c) * s)
}

export const GROOVE = { half: 0.0065, depth: 0.035 }

/** the spalled edge's reach from the cut, at x: ragged, here more, there less */
export const spallReach = (x: number) => 0.012 + 0.026 * (0.5 + 0.5 * noise(x * 7 + 3)) + 0.012 * (0.5 + 0.5 * noise(x * 31 + 9))

export interface JointSurface {
  top: THREE.BufferGeometry
  /** the surface's height in the worn state, at a point: what the crack lines lie on */
  wornAt: (x: number, z: number) => number
}

export function jointSurface([x0, x1]: [number, number], [z0, z1]: [number, number], { nx = 240, nz = 200, focusX = 0, pits: nPits = 150, k = 2 }: { nx?: number; nz?: number; focusX?: number; pits?: number; k?: number } = {}): JointSurface {
  let seed = 19
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const pits = Array.from({ length: nPits }, () => {
    const side = rnd() < 0.5 ? -1 : 1
    return { x: x0 + rnd() * (x1 - x0), z: side * (0.012 + Math.pow(rnd(), 1.7) * 0.42), r: 0.005 + rnd() * rnd() * 0.024, d: 0.003 + rnd() * 0.009 }
  })
  const groove = (z: number) => -GROOVE.depth * (1 - ss(GROOVE.half, GROOVE.half + 0.002, Math.abs(z)))
  const worn = (x: number, z: number) => {
    const az = Math.abs(z)
    const edge = ss(0, 0.04, Math.min(x - x0, x1 - x)) * ss(0, 0.04, Math.min(z - z0, z1 - z))
    const reach = spallReach(x)
    // the arris broken back: deep at the cut, feathering out to the reach, rough in the break
    const broken = az < reach ? 0.022 * Math.pow(1 - az / reach, 0.6) * (0.72 + 0.28 * noise(x * 90 + z * 70)) : 0
    let pit = 0
    for (const p of pits) {
      const dz = z - p.z
      if (Math.abs(dz) > p.r * 2.2) continue
      const dx = x - p.x
      if (Math.abs(dx) > p.r * 2.2) continue
      const q = (dx * dx + dz * dz) / (p.r * p.r)
      if (q < 4.8) pit = Math.max(pit, p.d * Math.exp(-q))
    }
    return Math.min(groove(z), -(broken + pit) * edge)
  }

  const nv = (nx + 1) * (nz + 1)
  const xs = Array.from({ length: nx + 1 }, (_, i) => warp(i / nx, x0, x1, focusX))
  const zs = Array.from({ length: nz + 1 }, (_, j) => warp(j / nz, z0, z1, 0, 2.8))
  const base = new Float32Array(nv * 3)
  const damaged = new Float32Array(nv * 3)
  const flat = new Float32Array(nv * 3)
  const uv = new Float32Array(nv * 2)
  const at = (i: number, j: number) => j * (nx + 1) + i
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const v = at(i, j)
      const x = xs[i]
      const z = zs[j]
      base.set([x, groove(z), z], v * 3)
      damaged.set([x, worn(x, z), z], v * 3)
      flat.set([x, 0, z], v * 3)
      uv.set([x * k, z * k], v * 2)
    }
  const normals = (pos: Float32Array) => {
    const out = new Float32Array(nv * 3)
    const n = new THREE.Vector3()
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const a = at(Math.max(0, i - 1), j)
        const b = at(Math.min(nx, i + 1), j)
        const c = at(i, Math.max(0, j - 1))
        const d = at(i, Math.min(nz, j + 1))
        const dx = pos[b * 3] - pos[a * 3]
        const dzz = pos[d * 3 + 2] - pos[c * 3 + 2]
        n.set(-(pos[b * 3 + 1] - pos[a * 3 + 1]) / dx, 1, -(pos[d * 3 + 1] - pos[c * 3 + 1]) / dzz).normalize()
        out.set([n.x, n.y, n.z], at(i, j) * 3)
      }
    return out
  }
  const idx: number[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const c = at(i, j + 1)
      const d = at(i + 1, j + 1)
      idx.push(a, c, b, b, c, d)
    }
  const top = new THREE.BufferGeometry()
  top.setAttribute('position', new THREE.BufferAttribute(base, 3))
  top.setAttribute('normal', new THREE.BufferAttribute(normals(base), 3))
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  top.setIndex(idx)
  top.morphAttributes.position = [new THREE.BufferAttribute(damaged, 3), new THREE.BufferAttribute(flat, 3)]
  top.morphAttributes.normal = [new THREE.BufferAttribute(normals(damaged), 3), new THREE.BufferAttribute(normals(flat), 3)]
  top.computeBoundingSphere()
  return { top, wornAt: worn }
}

/**
 * The screed under that surface: its four walls, split where the cut comes out at each end, and its
 * body below the deepest the cut goes. `T` is how thick it is.
 */
export function screedBody([x0, x1]: [number, number], [z0, z1]: [number, number], T: number, k = 2) {
  const d = GROOVE.depth + 0.001
  const w = 0.001
  const g = GROOVE.half
  return uvBox(
    merge([
      block([x0, -T, z0], [x1, -d, z1]),
      block([x0, -d, z1 - w], [x1, 0, z1]),
      block([x0, -d, z0], [x1, 0, z0 + w]),
      block([x0, -d, z0], [x0 + w, 0, -g]),
      block([x0, -d, g], [x0 + w, 0, z1]),
      block([x1 - w, -d, z0], [x1, 0, -g]),
      block([x1 - w, -d, g], [x1, 0, z1]),
    ]),
    k,
  )
}

/** the dark of the cut: a strip down in the groove, so the joint reads as a line at any distance */
export function jointSeam([x0, x1]: [number, number]) {
  return block([x0 + 0.001, -0.03, -GROOVE.half * 1.2], [x1 - 0.001, -0.012, GROOVE.half * 1.2])
}

/**
 * Micro-cracks running out from the joint across the surface: branching, ragged polylines, returned
 * as segments lying on `height`, nearest the cut first so they grow outward as they are drawn on.
 */
export function crackPaths([x0, x1]: [number, number], { count = 13, reach = 0.5, height = (_x: number, _z: number) => 0, lift = 0.0012, focus = 0, spread = 1 }: { count?: number; reach?: number; height?: (x: number, z: number) => number; lift?: number; focus?: number; spread?: number } = {}) {
  let seed = 73
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const segs: { d: number; a: number[]; b: number[] }[] = []
  const walk = (x: number, z: number, dir: number, ang: number, len: number, depth: number, gone: number) => {
    let cx = x
    let cz = z
    let a = ang
    const step = 0.012
    for (let s = 0; s < len / step; s++) {
      a += (rnd() - 0.5) * 0.55
      const nx = cx + Math.sin(a) * step
      const nz = cz + Math.cos(a) * step * dir
      if (nx < x0 + 0.02 || nx > x1 - 0.02) return
      segs.push({ d: gone + s * step, a: [cx, height(cx, cz) + lift, cz], b: [nx, height(nx, nz) + lift, nz] })
      cx = nx
      cz = nz
      if (depth > 0 && rnd() < 0.05) walk(cx, cz, dir, a + (rnd() < 0.5 ? -0.8 : 0.8), len * 0.45, depth - 1, gone + s * step)
    }
  }
  for (let c = 0; c < count; c++) {
    const x = focus + (rnd() - 0.5) * (x1 - x0) * spread
    const dir = c % 2 ? 1 : -1
    walk(x, dir * 0.006, dir, (rnd() - 0.5) * 0.9, reach * (0.45 + rnd() * 0.55), 2, 0)
  }
  segs.sort((p, q) => p.d - q.d)
  return segs
}
