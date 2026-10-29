import * as THREE from 'three'
import { smooth } from '../../progress'
import { BACK, HEIGHT, LEN, PROFILE } from './cornice'
import { CAST, PALLET } from './models'

/**
 * How the element is handled between the mould and the building: lifted (the rainscreen's crane arc
 * and timing, used for every lift on the page), set on its pallet, and wrapped.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** hoisted clear, brought across, lowered onto its place, as `lc` goes from 0 to 1 */
export function lift(lc: number, from: THREE.Vector3, to: THREE.Vector3, clear: number, out: THREE.Vector3) {
  const up = smooth(0, 0.45, lc)
  const across = smooth(0.38, 0.8, lc)
  const down = smooth(0.76, 1, lc)
  const top = Math.max(from.y, to.y) + clear
  return out.set(lerp(from.x, to.x, across), from.y + (top - from.y) * up - (top - to.y) * down, lerp(from.z, to.z, across))
}

/** the element face down on its pallet (its root, in the pallet's frame): its deepest point on the deck */
const DEEPEST = Math.max(...PROFILE.map(([u]) => u))
export const SEATED = { y: PALLET.h + BACK + DEEPEST, z: -CAST.z, rot: Math.PI / 2 } as const

/** the wrap: a sheet over the element on its pallet, its top just over the frame's (in the pallet's frame) */
export const WRAP = { w: 2.95, d: 1.25, nx: 52, nz: 24, top: SEATED.y - 0.035 + 0.02, hx: LEN / 2 + 0.03, hz: HEIGHT / 2 + 0.06 }

export function wrapGeometry() {
  const g = new THREE.PlaneGeometry(WRAP.w, WRAP.d, WRAP.nx, WRAP.nz).rotateX(-Math.PI / 2)
  return { geo: g, base: (g.getAttribute('position').array as Float32Array).slice() }
}

/**
 * The wrap as it is laid over the element on its pallet (`k`, 0..1): a sheet held flat above it comes
 * down, the middle first, and falls over the edges down to the pallet's deck.
 */
export function drape(g: THREE.BufferGeometry, base: Float32Array, k: number) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const a = pos.array as Float32Array
  const { hx, hz, top } = WRAP
  const deck = PALLET.h + 0.005
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3]
    const z = base[i * 3 + 2]
    // where it comes to rest: over the top, then down the sides as far as the sheet reaches
    const ex = Math.max(0, Math.abs(x) - hx)
    const ez = Math.max(0, Math.abs(z) - hz)
    const over = ex + ez
    const rx = Math.sign(x) * Math.min(Math.abs(x), hx + 0.012 + ex * 0.04)
    const rz = Math.sign(z) * Math.min(Math.abs(z), hz + 0.012 + ez * 0.06)
    const sag = 0.012 * Math.sin(x * 9.1 + z * 3.3) * Math.min(1, over * 6)
    const ry = Math.max(deck, top - over * 1.05) + sag
    // where it starts: flat, over it, barely moving
    const fy = top + 0.4 + 0.02 * Math.sin(x * 2.2) * Math.cos(z * 3.1)
    // the middle settles first, the edges after it
    const d = Math.min(1, (Math.abs(x) / (WRAP.w / 2) + Math.abs(z) / (WRAP.d / 2)) / 2)
    const w = smooth(d * 0.4, d * 0.4 + 0.6, k)
    a[i * 3] = lerp(x, rx, w)
    a[i * 3 + 1] = lerp(fy, ry, w)
    a[i * 3 + 2] = lerp(z, rz, w)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  g.computeBoundingSphere()
}

/** the concrete, fresh from the gun (darker, wet) and cured (its own white) */
export const WET = new THREE.Color('#a8a49b')
